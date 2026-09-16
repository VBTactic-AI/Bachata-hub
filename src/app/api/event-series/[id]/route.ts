import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getEventSeries,
  updateEventSeries,
  EventSeriesForbiddenError,
  EventSeriesNotFoundError,
  EventSeriesValidationError,
} from "@/server/events/event-series-service";
import { eventSeriesPatchSchema } from "@/server/events/series-schemas";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const series = await getEventSeries(id, user);
    return NextResponse.json({ series });
  } catch (e) {
    if (e instanceof EventSeriesForbiddenError) return NextResponse.json({ error: e.code }, { status: 403 });
    if (e instanceof EventSeriesNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    throw e;
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = eventSeriesPatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });

  try {
    const series = await updateEventSeries(id, user, parsed.data);
    return NextResponse.json({ ok: true, series });
  } catch (e) {
    if (e instanceof EventSeriesForbiddenError) return NextResponse.json({ error: e.code }, { status: 403 });
    if (e instanceof EventSeriesNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (e instanceof EventSeriesValidationError) return NextResponse.json({ error: e.code, message: e.message }, { status: 400 });
    throw e;
  }
}
