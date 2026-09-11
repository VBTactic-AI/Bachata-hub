import { NextResponse } from "next/server";
import { getCriteriaProfile, getJudgeActivity, getJudgingConsensus, getScoreDisputes, getScoreDistribution } from "@/server/statistics/judging-analytics";
import { respondToDomainError } from "@/server/http";

// Отдельный (ленивый) роут для тяжёлой части судейской аналитики
// (2026-09-11) — намеренно НЕ в том же запросе, что /statistics: он читает
// ВСЕ JudgeScore/FinalJudgeScore соревнования дважды (распределение оценок
// и споры между судьями строятся из одного общего прохода, но профиль
// критериев — отдельный проход по FinalJudgeScore). Загружается только при
// открытии вкладки "Аналитика судейства" на уже открытой панели статистики
// (тот же принцип экономии round-trip'ов, что и у самой кнопки "Показать
// статистику", docs/00_DECISIONS.md A30).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const [activity, consensus, distribution, criteriaProfile, disputes] = await Promise.all([
      getJudgeActivity(id),
      getJudgingConsensus(id),
      getScoreDistribution(id),
      getCriteriaProfile(id),
      getScoreDisputes(id, 5),
    ]);
    return NextResponse.json({ ok: true, activity, consensus, distribution, criteriaProfile, disputes });
  } catch (e) {
    return respondToDomainError(e);
  }
}
