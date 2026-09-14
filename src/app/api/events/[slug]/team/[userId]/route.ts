import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { removeTeamMember } from "@/server/events/team-service";
import { RegistrationForbiddenError, RegistrationNotFoundError } from "@/server/events/registration-service";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ slug: string; userId: string }> }) {
  const { slug, userId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const event = await prisma.event.findUnique({ where: { slug }, select: { id: true } });
  if (!event) return NextResponse.json({ error: "not_found" }, { status: 404 });

  try {
    await removeTeamMember(event.id, user, userId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof RegistrationForbiddenError) return NextResponse.json({ error: e.code }, { status: 403 });
    if (e instanceof RegistrationNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    throw e;
  }
}
