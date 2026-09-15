import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import type { EventRegistration } from "@prisma/client";
import {
  registerForEvent,
  cancelMyRegistration,
  listEventRegistrations,
  NoDancerProfileError,
  RegistrationClosedError,
  RegistrationForbiddenError,
  RegistrationNotFoundError,
  type RegistrationSortBy,
} from "@/server/events/registration-service";

const STATUS_VALUES: EventRegistration["status"][] = ["REGISTERED", "CONFIRMED", "WAITLIST", "CANCELLED", "REJECTED", "NO_SHOW"];
const SORT_VALUES: RegistrationSortBy[] = ["date", "name", "paid"];

// Events Engine, этап 2 — регистрация на обычное событие. НЕ путать с
// /api/registrations/** (Competition Engine, Слой 3) — другой домен, другая
// модель (см. комментарий у EventRegistration в schema.prisma).

async function getEventBySlug(slug: string) {
  return prisma.event.findUnique({ where: { slug } });
}

// Понятные пользователю сообщения (CLAUDE.md §46) — технические детали
// (какое именно поле не так) в логи не идут, потому что тут их и нет: набор
// ошибок сервиса закрытый и уже человекочитаемый по коду.
function errorResponse(e: unknown) {
  if (e instanceof NoDancerProfileError) {
    return NextResponse.json({ error: "no_dancer_profile", message: "Заполните профиль танцора перед регистрацией" }, { status: 400 });
  }
  if (e instanceof RegistrationClosedError) {
    return NextResponse.json({ error: "registration_closed", message: "Регистрация на это событие закрыта" }, { status: 400 });
  }
  if (e instanceof RegistrationForbiddenError) {
    return NextResponse.json(
      { error: e.code, message: e.code === "registration_decided_by_organizer" ? "Решение по вашей регистрации уже принято организатором — обратитесь к нему напрямую" : "Недостаточно прав" },
      { status: 403 }
    );
  }
  if (e instanceof RegistrationNotFoundError) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  throw e;
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const event = await getEventBySlug(slug);
  if (!event) return NextResponse.json({ error: "not_found" }, { status: 404 });

  try {
    const registration = await registerForEvent(event.id, user);
    return NextResponse.json({ ok: true, registration });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const event = await getEventBySlug(slug);
  if (!event) return NextResponse.json({ error: "not_found" }, { status: 404 });

  try {
    const registration = await cancelMyRegistration(event.id, user);
    return NextResponse.json({ ok: true, registration });
  } catch (e) {
    return errorResponse(e);
  }
}

// Список участников — для организатора события/ADMIN, пагинация
// ?page=&pageSize= (CLAUDE.md §24 — не грузить весь список одним запросом).
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const event = await getEventBySlug(slug);
  if (!event) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const url = new URL(req.url);
  const page = Number(url.searchParams.get("page") ?? "1") || 1;
  const pageSize = Number(url.searchParams.get("pageSize") ?? "50") || 50;
  const status = STATUS_VALUES.find((s) => s === url.searchParams.get("status"));
  const paidParam = url.searchParams.get("paid");
  const isPaid = paidParam === "yes" ? true : paidParam === "no" ? false : undefined;
  const sortBy = SORT_VALUES.find((s) => s === url.searchParams.get("sort"));
  const sortDir = url.searchParams.get("dir") === "desc" ? "desc" : "asc";

  try {
    const result = await listEventRegistrations(event.id, user, {
      page,
      pageSize,
      search: url.searchParams.get("q") ?? undefined,
      status,
      isPaid,
      sortBy,
      sortDir,
    });
    return NextResponse.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
