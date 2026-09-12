import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { eventDraftSchema } from "@/server/events/schemas";
import {
  upsertEventDraft,
  getEventDraftForEdit,
  EventForbiddenError,
  EventValidationError,
  EventNotFoundError,
} from "@/server/events/event-service";

// Event Engine — "Reload Draft"/"Continue Wizard": отдаёт сохранённый
// черновик со всеми type-specific данными, чтобы мастер мог восстановить
// состояние после перезагрузки страницы (не хранит его только в памяти
// вкладки).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    const event = await getEventDraftForEdit(id, user);
    return NextResponse.json({ ok: true, event });
  } catch (err) {
    if (err instanceof EventNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (err instanceof EventForbiddenError) return NextResponse.json({ error: err.code }, { status: 403 });
    throw err;
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = eventDraftSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const { event, competitionId } = await upsertEventDraft(parsed.data, user, id);
    return NextResponse.json({ ok: true, event, competitionId });
  } catch (err) {
    if (err instanceof EventNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (err instanceof EventForbiddenError) return NextResponse.json({ error: err.code }, { status: 403 });
    if (err instanceof EventValidationError) {
      return NextResponse.json({ error: "publish_incomplete", issues: err.issues }, { status: 400 });
    }
    throw err;
  }
}
