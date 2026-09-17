import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createFestivalDraft, listFestivalsForUser } from "@/server/events/festival-service";
import { respondToEventsError } from "@/server/events/http";

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  cityId: z.string().min(1),
  venueName: z.string().optional().nullable(),
  startsAt: z.string(),
  endsAt: z.string().optional().nullable(),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const festivals = await listFestivalsForUser(user);
  return NextResponse.json({ festivals });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });

  try {
    const festival = await createFestivalDraft(user, {
      ...parsed.data,
      startsAt: new Date(parsed.data.startsAt),
      endsAt: parsed.data.endsAt ? new Date(parsed.data.endsAt) : null,
    });
    return NextResponse.json({ ok: true, festival });
  } catch (e) {
    return respondToEventsError(e);
  }
}
