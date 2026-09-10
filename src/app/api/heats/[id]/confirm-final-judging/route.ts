import { NextRequest, NextResponse } from "next/server";
import { confirmFinalJudgeHeatDone } from "@/server/judging/final-scoring";
import { respondToDomainError } from "@/server/http";
import { measureServerOperationWithDuration, serverTimingHeader } from "@/lib/performance-debug/server";

// Судья нажимает "Готово" ПО ЗАХОДУ (только JUDGES_DANCE, 2026-09-10 — см.
// confirmFinalJudgeHeatDone/JudgeHeatConfirmation) — тела запроса не
// требует, heatId уже определяет, что подтверждается. Аналог
// /api/rounds/[id]/confirm-final-judging, но для форматов финала, где все
// заходы формируются сразу и подтверждение остаётся на весь раунд.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const [, serverMs] = await measureServerOperationWithDuration("judge.confirm_final_heat", () => confirmFinalJudgeHeatDone(id));
    return NextResponse.json({ ok: true }, { headers: serverTimingHeader(serverMs) });
  } catch (e) {
    return respondToDomainError(e);
  }
}
