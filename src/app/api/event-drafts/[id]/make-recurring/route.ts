import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createSeriesFromEvent, EventSeriesForbiddenError, EventSeriesNotFoundError, EventSeriesValidationError } from "@/server/events/event-series-service";
import { seriesFromEventSchema } from "@/server/events/series-schemas";

// "Сделать регулярным" — шаг "Повторение" EventWizard, появляется только
// если на шаге "Публикация" отмечена соответствующая опция (не отдельная
// форма создания серии, см. комментарий у createSeriesFromEvent). Событие
// с этим id становится occurrence №1 новой серии.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = seriesFromEventSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });

  try {
    const series = await createSeriesFromEvent(id, user, parsed.data);
    return NextResponse.json({ ok: true, series });
  } catch (e) {
    if (e instanceof EventSeriesForbiddenError) return NextResponse.json({ error: e.code }, { status: 403 });
    if (e instanceof EventSeriesNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (e instanceof EventSeriesValidationError) return NextResponse.json({ error: e.code, message: e.message }, { status: 400 });
    throw e;
  }
}
