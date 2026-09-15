import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { listTicketsForEvent } from "@/server/events/ticket-service";
import { RegistrationForbiddenError, RegistrationNotFoundError } from "@/server/events/registration-service";

async function getEventBySlug(slug: string) {
  return prisma.event.findUnique({ where: { slug }, select: { id: true } });
}

// Все билеты события (с Pass и passless) — используется статистикой/общим
// списком в будущей вкладке "Билеты".
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const event = await getEventBySlug(slug);
  if (!event) return NextResponse.json({ error: "not_found" }, { status: 404 });

  try {
    const tickets = await listTicketsForEvent(event.id, user);
    return NextResponse.json({ tickets });
  } catch (e) {
    if (e instanceof RegistrationForbiddenError) return NextResponse.json({ error: e.code }, { status: 403 });
    if (e instanceof RegistrationNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    throw e;
  }
}
