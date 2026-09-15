import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import {
  updateEventRegistration,
  RegistrationForbiddenError,
  RegistrationNotFoundError,
  CapacityExceededError,
} from "@/server/events/registration-service";

const patchSchema = z.object({
  status: z.enum(["REGISTERED", "CONFIRMED", "WAITLIST", "CANCELLED", "REJECTED", "NO_SHOW"]).optional(),
});

// Организатор события/ADMIN меняет статус одной конкретной регистрации
// (owner-check — внутри updateEventRegistration). Отметка оплаты — отдельный
// узкий эндпоинт (2026-09-16, см. payment/route.ts), т.к. оплата больше не
// поле этой модели (см. ticket-service.ts). slug в пути не используется для
// авторизации (её делает сам сервис по registration.event.createdById), но
// остаётся частью URL для консистентности с остальными
// /api/events/[slug]/registrations/**.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }
  if (parsed.data.status === undefined) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  try {
    const registration = await updateEventRegistration(id, user, parsed.data);
    return NextResponse.json({ ok: true, registration });
  } catch (e) {
    if (e instanceof RegistrationForbiddenError) return NextResponse.json({ error: e.code }, { status: 403 });
    if (e instanceof RegistrationNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    // QA BUG-004
    if (e instanceof CapacityExceededError) return NextResponse.json({ error: "capacity_exceeded", message: e.message }, { status: 400 });
    throw e;
  }
}
