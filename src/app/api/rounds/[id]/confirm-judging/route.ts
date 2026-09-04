import { NextRequest, NextResponse } from "next/server";
import { confirmJudgeRoundDone } from "@/server/judging/scoring";
import { respondToDomainError } from "@/server/http";

// Судья нажимает "Готово" по раунду формата "Да/Нет" (2026-09-04) — тела
// запроса не требует, roundId уже определяет, что подтверждается.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await confirmJudgeRoundDone(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respondToDomainError(e);
  }
}
