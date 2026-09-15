import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { updateTicketType, deleteTicketType, TicketTypeValidationError } from "@/server/events/ticket-type-service";
import { getCurrentUser } from "@/lib/auth";
import { RegistrationForbiddenError, RegistrationNotFoundError } from "@/server/events/registration-service";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  price: z.number().min(0).optional().nullable(),
  currency: z.string().optional().nullable(),
  quantity: z.number().int().positive().optional().nullable(),
  salesStartAt: z.coerce.date().optional().nullable(),
  salesEndAt: z.coerce.date().optional().nullable(),
  sortOrder: z.number().int().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });

  try {
    const ticketType = await updateTicketType(id, user, parsed.data);
    return NextResponse.json({ ok: true, ticketType });
  } catch (e) {
    if (e instanceof RegistrationForbiddenError) return NextResponse.json({ error: e.code }, { status: 403 });
    if (e instanceof RegistrationNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (e instanceof TicketTypeValidationError) return NextResponse.json({ error: e.code, message: e.message }, { status: 400 });
    throw e;
  }
}

// Настоящее удаление — только если по TicketType ещё не было продаж (см.
// комментарий у deleteTicketType). Если уже есть Ticket — используйте PATCH
// status/route.ts со статусом ARCHIVED.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    await deleteTicketType(id, user);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof RegistrationForbiddenError) return NextResponse.json({ error: e.code }, { status: 403 });
    if (e instanceof RegistrationNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (e instanceof TicketTypeValidationError) return NextResponse.json({ error: e.code, message: e.message }, { status: 400 });
    throw e;
  }
}
