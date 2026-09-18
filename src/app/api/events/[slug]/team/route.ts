import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  addTeamMember,
  listTeamMembers,
  EventTeamValidationError,
} from "@/server/events/team-service";
import { RegistrationForbiddenError, RegistrationNotFoundError } from "@/server/events/registration-service";

// Events Engine, этап 5 — команда события. НЕ путать с CompetitionMember
// (Слой 3) — другой домен, другая модель.

const addSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["MANAGER", "EDITOR", "CHECK_IN", "FINANCE"]),
});

async function getEventBySlug(slug: string) {
  return prisma.event.findUnique({ where: { slug }, select: { id: true } });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const event = await getEventBySlug(slug);
  if (!event) return NextResponse.json({ error: "not_found" }, { status: 404 });

  try {
    const members = await listTeamMembers(event.id, user);
    return NextResponse.json({ members });
  } catch (e) {
    if (e instanceof RegistrationForbiddenError) return NextResponse.json({ error: e.code }, { status: 403 });
    if (e instanceof RegistrationNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    throw e;
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = addSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }

  const event = await getEventBySlug(slug);
  if (!event) return NextResponse.json({ error: "not_found" }, { status: 404 });

  try {
    const member = await addTeamMember(event.id, user, parsed.data.userId, parsed.data.role);
    return NextResponse.json({ ok: true, member });
  } catch (e) {
    if (e instanceof RegistrationForbiddenError) return NextResponse.json({ error: e.code }, { status: 403 });
    if (e instanceof RegistrationNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (e instanceof EventTeamValidationError) return NextResponse.json({ error: "validation", message: e.message }, { status: 400 });
    throw e;
  }
}
