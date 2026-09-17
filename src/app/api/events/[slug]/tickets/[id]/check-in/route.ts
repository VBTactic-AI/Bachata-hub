import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { checkInTicket, cancelTicketCheckIn, getTicketCheckIn } from "@/server/events/ticket-checkin-service";
import { TicketValidationError } from "@/server/events/ticket-service";
import { RegistrationForbiddenError, RegistrationNotFoundError } from "@/server/events/registration-service";

const CHECK_IN_METHODS = ["QR", "MANUAL", "ADMIN"] as const;

// Отметка явки по билету — идемпотентно (повторный скан/клик не создаёт
// вторую запись). method: "QR" (сканер) | "MANUAL" (ручной клик в админке,
// по умолчанию) | "ADMIN" (корректирующая отметка).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const method = CHECK_IN_METHODS.includes(body?.method) ? body.method : "MANUAL";

  try {
    const checkIn = await checkInTicket(id, user, method);
    return NextResponse.json({ ok: true, checkIn });
  } catch (e) {
    if (e instanceof RegistrationForbiddenError) return NextResponse.json({ error: e.code }, { status: 403 });
    if (e instanceof RegistrationNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (e instanceof TicketValidationError) return NextResponse.json({ error: e.code, message: e.message }, { status: 400 });
    throw e;
  }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const checkIn = await getTicketCheckIn(id, user);
    return NextResponse.json({ checkIn });
  } catch (e) {
    if (e instanceof RegistrationForbiddenError) return NextResponse.json({ error: e.code }, { status: 403 });
    if (e instanceof RegistrationNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    throw e;
  }
}

// Отмена ошибочной отметки явки (по образцу cancelCheckIn() Competition Engine).
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    await cancelTicketCheckIn(id, user);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof RegistrationForbiddenError) return NextResponse.json({ error: e.code }, { status: 403 });
    if (e instanceof RegistrationNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    throw e;
  }
}
