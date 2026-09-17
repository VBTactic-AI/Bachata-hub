import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { sendFestivalPassBroadcast } from "@/server/events/festival-broadcast-service";
import { respondToEventsError } from "@/server/events/http";
import { BroadcastTargetInvalidError, BroadcastValidationError } from "@/server/notifications/broadcast";

const sendSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  clientRequestId: z.string().min(1),
});

// POST — рассылка держателям конкретного Pass фестиваля. НЕ общий Broadcast
// Composer (см. комментарий в festival-broadcast-service.ts) — узкая точка
// входа именно для консоли фестиваля, RBAC = владелец фестиваля/ADMIN.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; passId: string }> }) {
  const { id, passId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = sendSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });

  try {
    const result = await sendFestivalPassBroadcast(id, passId, user, parsed.data);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    // sendBroadcast() (Notification Engine, не Events/Festival домен) кидает
    // свою отдельную иерархию ошибок — respondToEventsError() её не ловит
    // (сознательно, см. комментарий в http.ts про независимые домены).
    if (e instanceof BroadcastValidationError || e instanceof BroadcastTargetInvalidError) {
      return NextResponse.json({ error: e.code }, { status: 400 });
    }
    return respondToEventsError(e);
  }
}
