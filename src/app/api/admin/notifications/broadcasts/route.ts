import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { sendBroadcast, BroadcastTargetInvalidError, BroadcastValidationError } from "@/server/notifications/broadcast";

const audienceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ALL_USERS") }),
  z.object({
    kind: z.literal("SUBSCRIBERS"),
    type: z.enum(["EVENT", "SCHOOL", "CITY", "COUNTRY", "EVENT_TYPE", "INSTRUCTOR", "ORGANIZER"]),
    targetId: z.string().min(1),
  }),
]);

const sendSchema = z.object({
  audience: audienceSchema,
  title: z.string().min(1),
  body: z.string().min(1),
  deepLink: z.string().optional().nullable(),
  priority: z.enum(["INFO", "IMPORTANT", "URGENT"]).optional(),
  clientRequestId: z.string().min(1),
});

// Отправка рассылки. Аудитория уже известна на входе (не через
// NotificationJob/шаблон) — см. src/server/notifications/broadcast.ts.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = sendSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  try {
    const result = await sendBroadcast({ ...parsed.data, sentById: user.id });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof BroadcastTargetInvalidError || err instanceof BroadcastValidationError) {
      return NextResponse.json({ error: err.code }, { status: 400 });
    }
    throw err;
  }
}
