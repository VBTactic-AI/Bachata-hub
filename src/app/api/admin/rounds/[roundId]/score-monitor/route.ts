import { NextRequest, NextResponse } from "next/server";
import { getScoreMonitorSnapshot } from "@/server/judging/score-monitor";
import { respondToDomainError } from "@/server/http";

// Полный снимок live-таблицы оценок — используется клиентом для пересинка
// при (пере)подключении SSE-потока (stream/route.ts): у SSE нет истории,
// после обрыва (например, таймаут serverless-функции на Vercel) клиент
// иначе остался бы молча со старыми данными. RBAC — внутри getScoreMonitorSnapshot
// (requirePermission("score:view_all", ...) в getPrelimScoreMonitor/getFinalScoreMonitor).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ roundId: string }> }) {
  const { roundId } = await params;
  try {
    const snapshot = await getScoreMonitorSnapshot(roundId);
    return NextResponse.json(snapshot);
  } catch (e) {
    return respondToDomainError(e);
  }
}
