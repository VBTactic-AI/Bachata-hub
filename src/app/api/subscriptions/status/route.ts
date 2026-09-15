import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getSubscribedTargetIds } from "@/server/notifications/subscriptions";

const SUBSCRIPTION_TYPES = ["EVENT", "SCHOOL", "CITY", "COUNTRY", "EVENT_TYPE", "INSTRUCTOR", "ORGANIZER"] as const;

const querySchema = z.object({
  type: z.enum(SUBSCRIPTION_TYPES),
  targetIds: z
    .string()
    .min(1)
    .transform((v) => v.split(",").filter(Boolean)),
});

// Батч-проверка для follow-кнопок в списках карточек (школы/города/...) —
// один запрос на список вместо одного на каждую карточку.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = querySchema.safeParse({
    type: req.nextUrl.searchParams.get("type") ?? undefined,
    targetIds: req.nextUrl.searchParams.get("targetIds") ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const subscribedTargetIds = await getSubscribedTargetIds(user.id, parsed.data.type, parsed.data.targetIds);
  return NextResponse.json({ subscribedTargetIds: Array.from(subscribedTargetIds) });
}
