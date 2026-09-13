import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getOrCreateNotificationPreference, updateNotificationPreference } from "@/server/notifications/preferences";

const EVENT_FORMATS = ["PARTY", "MASTERCLASS", "FESTIVAL", "CONTEST", "INTENSIVE"] as const;
const CHANNELS = ["IN_APP", "WEB_PUSH", "EMAIL", "TELEGRAM", "MOBILE_PUSH", "WHATSAPP"] as const;
const EMAIL_FREQUENCIES = ["IMMEDIATE", "DAILY_DIGEST", "WEEKLY_DIGEST"] as const;

const patchSchema = z
  .object({
    eventFormatsEnabled: z.array(z.enum(EVENT_FORMATS)).optional(),
    notifyReminders: z.boolean().optional(),
    reminderHoursBefore: z.array(z.number().int().positive()).optional(),
    notifyChanges: z.boolean().optional(),
    notifyCancellations: z.boolean().optional(),
    channelsEnabled: z.array(z.enum(CHANNELS)).optional(),
    emailFrequency: z.enum(EMAIL_FREQUENCIES).optional(),
  })
  .strict();

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const preference = await getOrCreateNotificationPreference(user.id);
  return NextResponse.json({ preference });
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const preference = await updateNotificationPreference(user.id, parsed.data);
  return NextResponse.json({ ok: true, preference });
}
