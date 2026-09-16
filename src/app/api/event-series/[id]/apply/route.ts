import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { applySeriesUpdate, EventSeriesForbiddenError, EventSeriesNotFoundError, EventSeriesValidationError } from "@/server/events/event-series-service";
import { seriesApplySchema } from "@/server/events/series-schemas";

// "Это и следующие" / "Вся серия" (задача §9/§10) — mode: "FOLLOWING" требует
// sinceOccurrenceDate (какое occurrence редактировали, чтобы применить только
// вперёд от него), mode: "ALL" применяет ко всем ещё не прошедшим occurrences
// серии. "Только это событие" НЕ проходит через этот роут вообще — это
// обычное PATCH /api/event-drafts/[id] на конкретный Event, ничего нового.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = seriesApplySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });

  if (parsed.data.mode === "FOLLOWING" && !parsed.data.sinceOccurrenceDate) {
    return NextResponse.json({ error: "since_occurrence_date_required" }, { status: 400 });
  }

  try {
    const result = await applySeriesUpdate(id, user, parsed.data.patch, {
      sinceOccurrenceDate: parsed.data.sinceOccurrenceDate ? new Date(parsed.data.sinceOccurrenceDate) : undefined,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof EventSeriesForbiddenError) return NextResponse.json({ error: e.code }, { status: 403 });
    if (e instanceof EventSeriesNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (e instanceof EventSeriesValidationError) return NextResponse.json({ error: e.code, message: e.message }, { status: 400 });
    throw e;
  }
}
