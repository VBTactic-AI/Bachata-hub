import { NextResponse } from "next/server";
import { EventsValidationError, RegistrationForbiddenError, RegistrationNotFoundError } from "./registration-service";
import { FestivalGuestQuestionRateLimitError } from "./festival-guest-question-service";

// Единый обработчик ошибок для Events/Festival API-роутов (2026-09-17,
// FINDING API-002). Та же идея, что и у respondToDomainError()
// (src/server/http.ts) — НО не тот же код и не общий импорт: Layer 1
// (Events/Festival) и Layer 3 (Competition Engine) намеренно независимые
// домены со своими иерархиями ошибок (docs/00_DECISIONS.md, D2), смешивать
// их импорты — заводить связь между системами, которой сегодня нет и не
// должно быть.
//
// Формат ответа НЕ меняется на предложенный ревью {error:{code,message,
// fields}} — уже отгруженные (до Festival Engine) роуты Pass/PassTemplate/
// Event используют {error: string, message?: string}, менять контракт всех
// потребителей без отдельного решения не стал. Этот responder — только
// устраняет повторяющийся instanceof-код внутри уже существующего формата,
// не меняет сам формат.
//
// Бросает исключение дальше, если это не наша ошибка — вызывающий код (или
// Next.js) должен сам решить, что делать с неожиданным исключением, эта
// функция не должна тихо превращать всё подряд в 500.
export function respondToEventsError(e: unknown): NextResponse {
  if (e instanceof RegistrationForbiddenError) {
    return NextResponse.json({ error: e.code }, { status: 403 });
  }
  if (e instanceof RegistrationNotFoundError) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (e instanceof FestivalGuestQuestionRateLimitError) {
    return NextResponse.json({ error: "rate_limited", message: e.message }, { status: 429 });
  }
  if (e instanceof EventsValidationError) {
    return NextResponse.json({ error: e.code, message: e.message }, { status: 400 });
  }
  throw e;
}
