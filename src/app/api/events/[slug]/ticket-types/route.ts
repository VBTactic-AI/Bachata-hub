import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { createTicketType, listTicketTypesForEvent, TicketTypeValidationError } from "@/server/events/ticket-type-service";
import { RegistrationForbiddenError, RegistrationNotFoundError } from "@/server/events/registration-service";

// Ticket Engine v2 — CRUD для TicketType одного события. Создание/
// редактирование — только владелец события/ADMIN (см. комментарий в
// ticket-type-service.ts). Зеркалит events/[slug]/passes/route.ts.

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  price: z.number().min(0).optional().nullable(),
  currency: z.string().optional().nullable(),
  quantity: z.number().int().positive().optional().nullable(),
  salesStartAt: z.coerce.date().optional().nullable(),
  salesEndAt: z.coerce.date().optional().nullable(),
  sortOrder: z.number().int().optional(),
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
    const ticketTypes = await listTicketTypesForEvent(event.id, user);
    return NextResponse.json({ ticketTypes });
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
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });

  const event = await getEventBySlug(slug);
  if (!event) return NextResponse.json({ error: "not_found" }, { status: 404 });

  try {
    const ticketType = await createTicketType(event.id, user, parsed.data);
    return NextResponse.json({ ok: true, ticketType });
  } catch (e) {
    if (e instanceof RegistrationForbiddenError) return NextResponse.json({ error: e.code }, { status: 403 });
    if (e instanceof RegistrationNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (e instanceof TicketTypeValidationError) return NextResponse.json({ error: e.code, message: e.message }, { status: 400 });
    throw e;
  }
}
