import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { suggestEvent } from "@/server/event-suggestions/submit";
import { getMyEventSuggestions } from "@/server/event-suggestions/queries";
import { EventSuggestionValidationError } from "@/server/event-suggestions/errors";

// GET — свои предложения (карточка статуса на /profile, по образцу
// GET /api/access-requests).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const suggestions = await getMyEventSuggestions(user.id);
  return NextResponse.json({ suggestions });
}

// POST — подача предложения (/suggest-event). Любой авторизованный
// пользователь, без RBAC-гейта — см. комментарий в submit.ts.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  try {
    const suggestion = await suggestEvent(user, body);
    return NextResponse.json({ ok: true, suggestion });
  } catch (err) {
    if (err instanceof EventSuggestionValidationError) {
      return NextResponse.json({ error: "invalid_input", issues: err.issues }, { status: 400 });
    }
    throw err;
  }
}
