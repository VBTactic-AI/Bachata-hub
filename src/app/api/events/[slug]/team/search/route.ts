import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { searchUsersForTeam } from "@/server/events/team-service";
import { RegistrationForbiddenError, RegistrationNotFoundError } from "@/server/events/registration-service";

// Поиск существующего пользователя по имени для добавления в команду
// события (2026-09-18) — см. searchUsersForTeam в team-service.ts.
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const event = await prisma.event.findUnique({ where: { slug }, select: { id: true } });
  if (!event) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const q = req.nextUrl.searchParams.get("q") ?? "";

  try {
    const results = await searchUsersForTeam(event.id, user, q);
    return NextResponse.json({ results });
  } catch (e) {
    if (e instanceof RegistrationForbiddenError) return NextResponse.json({ error: e.code }, { status: 403 });
    if (e instanceof RegistrationNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    throw e;
  }
}
