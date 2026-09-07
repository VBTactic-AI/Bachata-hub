import { NextRequest, NextResponse } from "next/server";
import { confirmFinalJudgeRoundDone } from "@/server/judging/final-scoring";
import { respondToDomainError } from "@/server/http";
import { measureServerOperationWithDuration, serverTimingHeader } from "@/lib/performance-debug/server";

// Судья нажимает "Готово" по финалу (2026-09-07, по образцу обычных раундов,
// confirm-judging/route.ts) — тела запроса не требует, roundId уже
// определяет, что подтверждается.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const [, serverMs] = await measureServerOperationWithDuration("judge.confirm_final_round", () => confirmFinalJudgeRoundDone(id));
    return NextResponse.json({ ok: true }, { headers: serverTimingHeader(serverMs) });
  } catch (e) {
    return respondToDomainError(e);
  }
}
