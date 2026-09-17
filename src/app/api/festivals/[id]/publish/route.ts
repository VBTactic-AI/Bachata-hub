import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { publishFestival } from "@/server/events/festival-service";
import { respondToEventsError } from "@/server/events/http";

// POST /api/festivals/[id]/publish — отдельное действие, не PATCH со
// status в теле (CLAUDE.md §45: сервер сам проверяет условия перехода, а
// не принимает произвольное целевое состояние от клиента).
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const event = await publishFestival(id, user);
    return NextResponse.json({ ok: true, event });
  } catch (e) {
    return respondToEventsError(e);
  }
}
