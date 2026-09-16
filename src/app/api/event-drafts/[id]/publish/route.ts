import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { publishEvent, EventForbiddenError, EventNotFoundError, EventValidationError, EVENT_FORBIDDEN_MESSAGES } from "@/server/events/event-service";

// "Опубликовать" из таблички "Мои события" (см. комментарий у publishEvent,
// event-service.ts) — явное действие, не PATCH status=PUBLISHED (CLAUDE.md §45).
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;

  try {
    const event = await publishEvent(id, user);
    return NextResponse.json({ ok: true, event });
  } catch (err) {
    if (err instanceof EventNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (err instanceof EventForbiddenError) {
      return NextResponse.json({ error: err.code, message: EVENT_FORBIDDEN_MESSAGES[err.code] }, { status: 403 });
    }
    if (err instanceof EventValidationError) {
      const missing = err.issues.filter((i) => !i.ok).map((i) => i.label);
      return NextResponse.json(
        { error: "publish_incomplete", issues: err.issues, message: `Не удалось опубликовать: не заполнено — ${missing.join(", ")}.` },
        { status: 400 }
      );
    }
    throw err;
  }
}
