import { NextRequest, NextResponse } from "next/server";
import { generateJudgesDanceStage } from "@/server/judging/final-judges-dance";
import { respondToDomainError } from "@/server/http";

// Сформировать список заходов текущей стадии JUDGES_DANCE целиком
// (generateJudgesDanceStage сам решает, стадия 1 это или 2, по
// FinalSession.currentStage и статусам уже существующих заходов) — заходы
// создаются PENDING, запускает их организатор по одному отдельной кнопкой
// (обычный /api/heats/[id]/transition, как и в остальных раундах).
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const result = await generateJudgesDanceStage(id);
    return NextResponse.json(result);
  } catch (e) {
    return respondToDomainError(e);
  }
}
