import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { eventDraftSchema } from "@/server/events/schemas";
import { upsertEventDraft, EventForbiddenError, EventValidationError } from "@/server/events/event-service";

// Event Engine — единая точка входа и для "Save Draft", и для "Publish"
// (разница — только поле status в теле запроса). Заменяет прежний
// однопроходный POST /api/events (плоская форма без черновиков).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = eventDraftSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const { event, competitionId } = await upsertEventDraft(parsed.data, user);
    return NextResponse.json({ ok: true, event, competitionId });
  } catch (err) {
    if (err instanceof EventForbiddenError) {
      return NextResponse.json({ error: err.code }, { status: 403 });
    }
    if (err instanceof EventValidationError) {
      return NextResponse.json({ error: "publish_incomplete", issues: err.issues }, { status: 400 });
    }
    throw err;
  }
}
