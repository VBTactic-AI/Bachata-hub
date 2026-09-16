import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { activateEventSeries, EventSeriesForbiddenError, EventSeriesNotFoundError } from "@/server/events/event-series-service";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const series = await activateEventSeries(id, user);
    return NextResponse.json({ ok: true, series });
  } catch (e) {
    if (e instanceof EventSeriesForbiddenError) return NextResponse.json({ error: e.code }, { status: e.code === "invalid_transition" ? 409 : 403 });
    if (e instanceof EventSeriesNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    throw e;
  }
}
