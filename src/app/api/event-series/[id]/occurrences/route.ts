import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listSeriesOccurrences, EventSeriesForbiddenError, EventSeriesNotFoundError } from "@/server/events/event-series-service";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const limit = Number(sp.get("limit")) || undefined;
  const cursor = sp.get("cursor") || undefined;
  const includePast = sp.get("includePast") === "1";

  try {
    const result = await listSeriesOccurrences(id, user, { limit, cursor, includePast });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof EventSeriesForbiddenError) return NextResponse.json({ error: e.code }, { status: 403 });
    if (e instanceof EventSeriesNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    throw e;
  }
}
