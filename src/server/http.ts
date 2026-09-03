import { NextResponse } from "next/server";
import {
  AlreadyRegisteredError,
  AuthenticationRequiredError,
  ConcurrentModificationError,
  DomainError,
  InvalidStateTransitionError,
  NoDancerProfileError,
  NotCompetitionMemberError,
  PermissionDeniedError,
  RegistrationNotOpenError,
  ValidationFailedError,
} from "./errors";

// Единая точка перевода доменных ошибок в HTTP-ответ для route handlers
// движка соревнований — чтобы каждый API-роут не дублировал instanceof-цепочку.
export function respondToDomainError(e: unknown): NextResponse {
  if (e instanceof AuthenticationRequiredError) {
    return NextResponse.json({ error: e.userMessage }, { status: 401 });
  }
  if (e instanceof PermissionDeniedError || e instanceof NotCompetitionMemberError) {
    return NextResponse.json({ error: e.userMessage }, { status: 403 });
  }
  if (e instanceof ConcurrentModificationError) {
    return NextResponse.json({ error: e.userMessage }, { status: 409 });
  }
  if (
    e instanceof InvalidStateTransitionError ||
    e instanceof ValidationFailedError ||
    e instanceof RegistrationNotOpenError ||
    e instanceof AlreadyRegisteredError ||
    e instanceof NoDancerProfileError
  ) {
    return NextResponse.json({ error: e.userMessage }, { status: 400 });
  }
  if (e instanceof DomainError) {
    return NextResponse.json({ error: e.userMessage }, { status: 400 });
  }
  // Техническая причина — только в серверный лог (CLAUDE.md §46), наружу —
  // общая фраза.
  console.error(e);
  return NextResponse.json({ error: "Внутренняя ошибка сервера." }, { status: 500 });
}
