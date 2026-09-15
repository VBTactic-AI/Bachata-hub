import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { issueFestivalPassEntryForRegistration, TicketValidationError } from "@/server/events/ticket-service";
import { RegistrationForbiddenError, RegistrationNotFoundError } from "@/server/events/registration-service";

// Этап 3 (межсобытийный Pass фестиваля, 2026-09-16) — материализует вход на
// это (дочернее) событие для танцора, у которого есть действующий Pass
// фестиваля, дающий сюда доступ. См. issueFestivalPassEntry() в
// ticket-service.ts.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const ticket = await issueFestivalPassEntryForRegistration(id, user);
    return NextResponse.json({ ok: true, ticket });
  } catch (e) {
    if (e instanceof RegistrationForbiddenError) return NextResponse.json({ error: e.code }, { status: 403 });
    if (e instanceof RegistrationNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (e instanceof TicketValidationError) return NextResponse.json({ error: e.code, message: e.message }, { status: 400 });
    throw e;
  }
}
