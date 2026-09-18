import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { duplicateEvent, EventForbiddenError, EventNotFoundError } from "@/server/events/event-service";
import { EVENT_FORBIDDEN_MESSAGES } from "@/server/events/event-service";

// "Дублировать" из таблички "Мои события" — см. duplicateEvent() в
// event-service.ts. Копия всегда DRAFT, редирект на её мастер редактирования
// делает клиент (EventDuplicateButton.tsx) по возвращённому slug/id.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;

  try {
    const event = await duplicateEvent(id, user);
    return NextResponse.json({ ok: true, event: { id: event.id, slug: event.slug } });
  } catch (err) {
    if (err instanceof EventNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (err instanceof EventForbiddenError) {
      return NextResponse.json({ error: err.code, message: EVENT_FORBIDDEN_MESSAGES[err.code] }, { status: 403 });
    }
    throw err;
  }
}
