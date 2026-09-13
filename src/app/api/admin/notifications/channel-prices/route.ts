import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { listChannelPrices, setChannelPrice, InvalidChannelPriceError } from "@/server/notifications/control-center";

// Subscription & Notification Control Center — редактируемая ОЦЕНОЧНАЯ цена
// доставки за канал (см. комментарий в prisma/schema.prisma у
// NotificationChannelPrice: не реальный биллинг, число вводит админ сам).
// Доступ — тот же isAdmin, что и у "База данных"/"Модерация" (инфраструктурные
// настройки проекта, не для EVENT_ADMIN и ниже).

const patchSchema = z.object({
  channel: z.enum(["WEB_PUSH", "EMAIL", "TELEGRAM", "MOBILE_PUSH", "WHATSAPP"]),
  pricePerThousand: z.number().min(0),
  currency: z.string().min(1).max(8).optional(),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const prices = await listChannelPrices();
  return NextResponse.json({ prices });
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  try {
    await setChannelPrice(user.id, parsed.data.channel, parsed.data.pricePerThousand, parsed.data.currency);
  } catch (err) {
    if (err instanceof InvalidChannelPriceError) {
      return NextResponse.json({ error: err.code }, { status: 400 });
    }
    throw err;
  }

  const prices = await listChannelPrices();
  return NextResponse.json({ ok: true, prices });
}
