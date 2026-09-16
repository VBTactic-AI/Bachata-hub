import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listEventSeriesForUser } from "@/server/events/event-series-service";

// POST (создание пустой серии) больше нет — серия заводится ТОЛЬКО из уже
// созданного Event, который становится occurrence №1 (POST /api/event-drafts/
// [id]/make-recurring), см. комментарий у createSeriesFromEvent.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const includeArchived = req.nextUrl.searchParams.get("includeArchived") === "1";
  const series = await listEventSeriesForUser(user, includeArchived);
  return NextResponse.json({ series });
}
