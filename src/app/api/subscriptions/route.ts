import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { listSubscriptions, subscribe, SubscriptionTargetInvalidError } from "@/server/notifications/subscriptions";

const SUBSCRIPTION_TYPES = ["EVENT", "SCHOOL", "CITY", "COUNTRY", "EVENT_TYPE", "INSTRUCTOR", "ORGANIZER"] as const;

const subscribeSchema = z.object({
  type: z.enum(SUBSCRIPTION_TYPES),
  targetId: z.string().min(1),
});

const listQuerySchema = z.object({
  type: z.enum(SUBSCRIPTION_TYPES).optional(),
});

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = listQuerySchema.safeParse({ type: req.nextUrl.searchParams.get("type") ?? undefined });
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const subscriptions = await listSubscriptions(user.id, parsed.data.type);
  return NextResponse.json({ subscriptions });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = subscribeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  try {
    const subscription = await subscribe(user.id, parsed.data.type, parsed.data.targetId);
    return NextResponse.json({ ok: true, subscription });
  } catch (err) {
    if (err instanceof SubscriptionTargetInvalidError) {
      return NextResponse.json({ error: err.code }, { status: 400 });
    }
    throw err;
  }
}
