import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { updateFestivalSponsor, deleteFestivalSponsor, FestivalSponsorValidationError } from "@/server/events/festival-sponsor-service";
import { RegistrationForbiddenError, RegistrationNotFoundError } from "@/server/events/registration-service";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  tier: z.string().min(1).optional(),
  logoUrl: z.string().optional().nullable(),
  websiteUrl: z.string().optional().nullable(),
  amount: z.number().min(0).optional().nullable(),
  currency: z.string().optional().nullable(),
  sortOrder: z.number().int().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; sponsorId: string }> }) {
  const { sponsorId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });

  try {
    const sponsor = await updateFestivalSponsor(sponsorId, user, parsed.data);
    return NextResponse.json({ ok: true, sponsor });
  } catch (e) {
    if (e instanceof RegistrationForbiddenError) return NextResponse.json({ error: e.code }, { status: 403 });
    if (e instanceof RegistrationNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (e instanceof FestivalSponsorValidationError) return NextResponse.json({ error: e.code, message: e.message }, { status: 400 });
    throw e;
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; sponsorId: string }> }) {
  const { sponsorId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    await deleteFestivalSponsor(sponsorId, user);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof RegistrationForbiddenError) return NextResponse.json({ error: e.code }, { status: 403 });
    if (e instanceof RegistrationNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    throw e;
  }
}
