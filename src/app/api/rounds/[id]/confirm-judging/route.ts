import { NextRequest, NextResponse } from "next/server";
import { confirmJudgeRoundDone } from "@/server/judging/scoring";
import { respondToDomainError } from "@/server/http";
import { measureServerOperationWithDuration, serverTimingHeader } from "@/lib/performance-debug/server";

// Судья нажимает "Готово" по раунду формата "Да/Нет" (2026-09-04) — тела
// запроса не требует, roundId уже определяет, что подтверждается.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const [, serverMs] = await measureServerOperationWithDuration("judge.confirm_round", () => confirmJudgeRoundDone(id));
    return NextResponse.json({ ok: true }, { headers: serverTimingHeader(serverMs) });
  } catch (e) {
    return respondToDomainError(e);
  }
}
