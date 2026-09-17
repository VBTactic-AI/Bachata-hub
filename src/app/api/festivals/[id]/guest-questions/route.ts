import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import {
  submitGuestQuestion,
  listGuestQuestions,
  FestivalGuestQuestionValidationError,
  FestivalGuestQuestionRateLimitError,
} from "@/server/events/festival-guest-question-service";
import { RegistrationForbiddenError, RegistrationNotFoundError } from "@/server/events/registration-service";

const createSchema = z.object({
  askerName: z.string().max(200).optional().nullable(),
  question: z.string().min(1).max(1000),
});

function extractClientIp(req: NextRequest): string | null {
  // Стандартный заголовок за прокси/CDN (Vercel и большинство остальных) —
  // первый адрес в списке — исходный клиент.
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || null;
  return req.headers.get("x-real-ip");
}

// GET — очередь организатора (все вопросы, включая неодобренные).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const items = await listGuestQuestions(id, user);
    return NextResponse.json({ items });
  } catch (e) {
    if (e instanceof RegistrationForbiddenError) return NextResponse.json({ error: e.code }, { status: 403 });
    if (e instanceof RegistrationNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    throw e;
  }
}

// POST — анонимно, без логина (прямое решение пользователя): гость
// задаёт вопрос организатору без аккаунта. Лимит по IP — см.
// festival-guest-question-service.ts.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });

  try {
    const item = await submitGuestQuestion(id, { ...parsed.data, submitterIp: extractClientIp(req) });
    return NextResponse.json({ ok: true, item });
  } catch (e) {
    if (e instanceof RegistrationNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (e instanceof FestivalGuestQuestionRateLimitError) return NextResponse.json({ error: "rate_limited", message: e.message }, { status: 429 });
    if (e instanceof FestivalGuestQuestionValidationError) return NextResponse.json({ error: e.code, message: e.message }, { status: 400 });
    throw e;
  }
}
