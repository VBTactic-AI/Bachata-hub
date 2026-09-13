import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { previewBroadcastAudience, BroadcastTargetInvalidError } from "@/server/notifications/broadcast";

const audienceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ALL_USERS") }),
  z.object({
    kind: z.literal("SUBSCRIBERS"),
    type: z.enum(["EVENT", "SCHOOL", "CITY", "COUNTRY", "EVENT_TYPE", "INSTRUCTOR"]),
    targetId: z.string().min(1),
  }),
]);

// Только подсчёт получателей — без отправки. Позволяет админу увидеть "кому
// уйдёт" до подтверждения (см. Control Center, Broadcast).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = audienceSchema.safeParse(body?.audience);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  try {
    const result = await previewBroadcastAudience(parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof BroadcastTargetInvalidError) {
      return NextResponse.json({ error: err.code }, { status: 400 });
    }
    throw err;
  }
}
