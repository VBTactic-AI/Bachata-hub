import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getFestivalForEdit, updateFestivalDraft, deleteFestivalDraft } from "@/server/events/festival-service";
import { respondToEventsError } from "@/server/events/http";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  cityId: z.string().min(1).optional(),
  venueName: z.string().optional().nullable(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional().nullable(),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const festival = await getFestivalForEdit(id, user);
    return NextResponse.json({ festival });
  } catch (e) {
    return respondToEventsError(e);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });

  try {
    const festival = await updateFestivalDraft(id, user, {
      ...parsed.data,
      startsAt: parsed.data.startsAt ? new Date(parsed.data.startsAt) : undefined,
      endsAt: parsed.data.endsAt !== undefined ? (parsed.data.endsAt ? new Date(parsed.data.endsAt) : null) : undefined,
    });
    return NextResponse.json({ ok: true, festival });
  } catch (e) {
    return respondToEventsError(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    await deleteFestivalDraft(id, user);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respondToEventsError(e);
  }
}
