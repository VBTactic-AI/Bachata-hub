import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/server/rbac/authorize";
import { respondToDomainError } from "@/server/http";
import { mintRoundRealtimeToken } from "@/server/realtime/round-token";

// Выдаёт короткоживущий токен для прямой подписки браузера на Supabase
// Realtime (см. round-token.ts) — браузер обновляет его периодически, пока
// держит live-таблицу открытой (токен короче сессии приложения специально:
// отозванный доступ не будет действовать дольше нескольких минут).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ roundId: string }> }) {
  const { roundId } = await params;
  try {
    const round = await prisma.round.findUniqueOrThrow({
      where: { id: roundId },
      select: { division: { select: { competitionId: true } } },
    });
    const actor = await requirePermission("score:view_all", round.division.competitionId);
    const { token, expiresInSeconds } = await mintRoundRealtimeToken(actor.userId, roundId);
    return NextResponse.json({ token, expiresInSeconds });
  } catch (e) {
    return respondToDomainError(e);
  }
}
