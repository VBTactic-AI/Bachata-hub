import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { markRegistrationPayment } from "@/server/events/ticket-service";
import { RegistrationForbiddenError, RegistrationNotFoundError } from "@/server/events/registration-service";

const patchSchema = z.object({ isPaid: z.boolean() });

// Оплата "1 билет на участника" (2026-09-16, Ticket Engine) — отдельный
// эндпоинт от общего PATCH status (.../[id]/route.ts): оплата больше не поле
// EventRegistration, а живёт в Ticket (см. ticket-service.ts). Заводит
// passless Ticket лениво при первой отметке "оплачено" — см. комментарий у
// markRegistrationPayment.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  try {
    const ticket = await markRegistrationPayment(id, user, parsed.data.isPaid);
    return NextResponse.json({ ok: true, ticket });
  } catch (e) {
    if (e instanceof RegistrationForbiddenError) return NextResponse.json({ error: e.code }, { status: 403 });
    if (e instanceof RegistrationNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    throw e;
  }
}
