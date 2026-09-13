import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Notification & Subscription Engine — регистрация Web Push подписки браузера
// (Phase 5). Endpoint/keys приходят от PushManager.subscribe() на клиенте
// (см. WebPushToggle.tsx) — сервер только сохраняет их как NotificationEndpoint,
// не проверяет валидность подписки (это делает push-сервис при реальной отправке).
const subscribeSchema = z.object({
  channel: z.literal("WEB_PUSH"),
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = subscribeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const endpointRow = await prisma.notificationEndpoint.upsert({
    where: { userId_channel_endpoint: { userId: user.id, channel: "WEB_PUSH", endpoint: parsed.data.endpoint } },
    create: {
      userId: user.id,
      channel: "WEB_PUSH",
      endpoint: parsed.data.endpoint,
      metadata: parsed.data.keys,
      enabled: true,
    },
    // Повторная подписка того же браузера (напр. после истечения) — тот же
    // endpoint, но keys теоретически могут обновиться; enabled возвращается
    // в true, если до этого был отключён по 410 (см. web-push-provider.ts).
    update: { metadata: parsed.data.keys, enabled: true },
  });

  return NextResponse.json({ ok: true, endpoint: { id: endpointRow.id } });
}

const unsubscribeSchema = z.object({ endpoint: z.string().url() });

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = unsubscribeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  await prisma.notificationEndpoint.deleteMany({
    where: { userId: user.id, channel: "WEB_PUSH", endpoint: parsed.data.endpoint },
  });

  return NextResponse.json({ ok: true });
}
