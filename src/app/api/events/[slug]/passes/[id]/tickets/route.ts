import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { issueTicket, listTicketsForPass, TicketValidationError, DuplicateTicketError } from "@/server/events/ticket-service";
import { RegistrationForbiddenError, RegistrationNotFoundError } from "@/server/events/registration-service";

const issueSchema = z.object({
  dancerId: z.string().min(1),
  markPaid: z.boolean().optional(),
});

// Билеты одного Pass — GET список держателей, POST выдать новый билет
// (organizer/ADMIN/член команды вручную, см. комментарий у issueTicket).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const tickets = await listTicketsForPass(id, user);
    return NextResponse.json({ tickets });
  } catch (e) {
    if (e instanceof RegistrationForbiddenError) return NextResponse.json({ error: e.code }, { status: 403 });
    if (e instanceof RegistrationNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    throw e;
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = issueSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  try {
    const ticket = await issueTicket(id, parsed.data.dancerId, user, { markPaid: parsed.data.markPaid });
    return NextResponse.json({ ok: true, ticket });
  } catch (e) {
    if (e instanceof RegistrationForbiddenError) return NextResponse.json({ error: e.code }, { status: 403 });
    if (e instanceof RegistrationNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (e instanceof DuplicateTicketError) {
      return NextResponse.json({ error: "duplicate_ticket", message: "Этот танцор уже купил данный Pass." }, { status: 409 });
    }
    if (e instanceof TicketValidationError) return NextResponse.json({ error: e.code, message: e.message }, { status: 400 });
    throw e;
  }
}
