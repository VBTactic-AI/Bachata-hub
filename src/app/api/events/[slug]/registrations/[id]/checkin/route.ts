import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { toggleEventRegistrationCheckIn, RegistrationForbiddenError, RegistrationNotFoundError } from "@/server/events/registration-service";

const patchSchema = z.object({ checkedIn: z.boolean() });

// Door check-in (2026-09-16) — отдельный эндпоинт от общего PATCH
// status/isPaid (.../[id]/route.ts): независимая ось, свой единственный
// особый случай (снятие NO_SHOW при отметке check-in), см.
// registration-service.ts::toggleEventRegistrationCheckIn.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  try {
    const registration = await toggleEventRegistrationCheckIn(id, user, parsed.data.checkedIn);
    return NextResponse.json({ ok: true, registration });
  } catch (e) {
    if (e instanceof RegistrationForbiddenError) return NextResponse.json({ error: e.code }, { status: 403 });
    if (e instanceof RegistrationNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    throw e;
  }
}
