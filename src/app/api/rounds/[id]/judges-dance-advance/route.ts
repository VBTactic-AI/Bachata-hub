import { NextRequest, NextResponse } from "next/server";
import { advanceJudgesDanceStage } from "@/server/judging/final-judges-dance";
import { respondToDomainError } from "@/server/http";

// Одно действие "Далее" на всю прогрессию стадий JUDGES_DANCE — сервис сам
// решает, что делать (начать стадию 1 / завершить 1 и начать 2 / завершить
// 2 и подсчитать результат) по текущему FinalSession.currentStage.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const result = await advanceJudgesDanceStage(id);
    return NextResponse.json(result);
  } catch (e) {
    return respondToDomainError(e);
  }
}
