import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { cancelEvent, EventForbiddenError, EventNotFoundError } from "@/server/events/event-service";

// Явное действие ("Отменить событие"), не голый PATCH status=ARCHIVED
// (CLAUDE.md §45) — сервер сам решает, нужно ли уведомление (только если
// событие было реально видимым, см. cancelEvent()).
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;

  try {
    const event = await cancelEvent(id, user);
    return NextResponse.json({ ok: true, event });
  } catch (err) {
    if (err instanceof EventNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (err instanceof EventForbiddenError) return NextResponse.json({ error: err.code }, { status: 403 });
    throw err;
  }
}
