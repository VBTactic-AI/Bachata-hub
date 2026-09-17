import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { createFestivalSponsor, listFestivalSponsors } from "@/server/events/festival-sponsor-service";
import { respondToEventsError } from "@/server/events/http";

const createSchema = z.object({
  name: z.string().min(1),
  tier: z.string().min(1),
  logoUrl: z.string().optional().nullable(),
  websiteUrl: z.string().optional().nullable(),
  amount: z.number().min(0).optional().nullable(),
  currency: z.string().optional().nullable(),
  sortOrder: z.number().int().optional(),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const sponsors = await listFestivalSponsors(id, user);
    return NextResponse.json({ sponsors });
  } catch (e) {
    return respondToEventsError(e);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });

  try {
    const sponsor = await createFestivalSponsor(id, user, parsed.data);
    return NextResponse.json({ ok: true, sponsor });
  } catch (e) {
    return respondToEventsError(e);
  }
}
