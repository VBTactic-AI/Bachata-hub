import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { archiveFestival } from "@/server/events/festival-service";
import { respondToEventsError } from "@/server/events/http";

// POST /api/festivals/[id]/archive — снимает bridge-Event с публикации
// (archiveFestival уже существовала в festival-service.ts с Stage 1, но у
// неё не было API-роута — перенос UI консоли фестиваля первым делом
// потребовал кнопку "Архивировать", отсюда и роут).
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const festival = await archiveFestival(id, user);
    return NextResponse.json({ ok: true, festival });
  } catch (e) {
    return respondToEventsError(e);
  }
}
