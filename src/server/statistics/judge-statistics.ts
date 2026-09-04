import { prisma } from "@/lib/prisma";
import { requirePermission } from "../rbac/authorize";
import { mean, stdDev, spearmanCorrelation } from "./stats-math";

// Судейская статистика (CLAUDE.md §37) — формулы для "согласия с панелью" и
// "доли выбросов" нигде не описаны конкретными числами; реализованы по
// общепринятым в судейских системах бальных танцев/фигурного катания методикам
// (ранговая корреляция Спирмена, z-score относительно панели) — пользователь
// явно доверил выбор конкретных формул исполнителю (2026-09-05). Среднее
// время на оценку (CLAUDE.md §37) сознательно не считается в этом объёме —
// потребовало бы сопоставления с моментом старта захода, отдельная задача.
export type JudgeStatistics = {
  judgeUserId: string;
  judgeEmail: string;
  scoresCount: number;
  averageScore: number | null; // нормализовано 0..1 (доля от максимума шкалы/критерия)
  scoreStdDev: number | null;
  panelAgreement: number | null; // средняя ранговая корреляция с остальной панелью, -1..1
  outlierRate: number | null; // доля оценок, отклонившихся от панели больше чем на 2 стандартных отклонения
};

type NormalizedItem = { contextKey: string; drawParticipantId: string; judgeUserId: string; normalized: number };

export async function getJudgeStatisticsForCompetition(competitionId: string): Promise<JudgeStatistics[]> {
  await requirePermission("statistics:view", competitionId);

  const assignments = await prisma.judgeAssignment.findMany({
    where: { division: { competitionId } },
    select: { id: true, judgeUserId: true, judge: { select: { email: true } } },
  });
  if (assignments.length === 0) return [];
  const assignmentIds = assignments.map((a) => a.id);
  const judgeByAssignmentId = new Map(assignments.map((a) => [a.id, a.judgeUserId]));
  const emailByJudgeUserId = new Map(assignments.map((a) => [a.judgeUserId, a.judge.email]));

  const [judgeScores, finalJudgeScores] = await Promise.all([
    prisma.judgeScore.findMany({
      where: { judgeAssignmentId: { in: assignmentIds } },
      select: {
        value: true,
        maxValue: true,
        judgeAssignmentId: true,
        drawParticipantId: true,
        drawParticipant: { select: { draw: { select: { heat: { select: { roundId: true } } } } } },
      },
    }),
    prisma.finalJudgeScore.findMany({
      where: { judgeAssignmentId: { in: assignmentIds } },
      select: {
        value: true,
        criterionId: true,
        judgeAssignmentId: true,
        drawParticipantId: true,
        criterion: { select: { minScore: true, maxScore: true } },
        drawParticipant: { select: { draw: { select: { heat: { select: { roundId: true } } } } } },
      },
    }),
  ]);

  // "Контекст оценки" — область, внутри которой сравниваем судью с панелью:
  // весь обычный раунд для JudgeScore (одна общая шкала на всех участников),
  // конкретный критерий конкретного раунда финала для FinalJudgeScore (у
  // разных критериев разные диапазоны и, возможно, разный состав судящих —
  // JUDGES_DANCE, A22).
  const items: NormalizedItem[] = [];
  for (const s of judgeScores) {
    const judgeUserId = judgeByAssignmentId.get(s.judgeAssignmentId);
    if (!judgeUserId) continue;
    items.push({
      contextKey: `round:${s.drawParticipant.draw.heat.roundId}`,
      drawParticipantId: s.drawParticipantId,
      judgeUserId,
      normalized: s.maxValue > 0 ? s.value / s.maxValue : 0,
    });
  }
  for (const s of finalJudgeScores) {
    const judgeUserId = judgeByAssignmentId.get(s.judgeAssignmentId);
    if (!judgeUserId) continue;
    const range = s.criterion.maxScore - s.criterion.minScore;
    items.push({
      contextKey: `criterion:${s.drawParticipant.draw.heat.roundId}:${s.criterionId}`,
      drawParticipantId: s.drawParticipantId,
      judgeUserId,
      normalized: range > 0 ? (s.value - s.criterion.minScore) / range : 0,
    });
  }

  // contextKey -> drawParticipantId -> [{судья, значение}] — "кто что кому
  // поставил" внутри одного контекста, панель для outlier/корреляции строится
  // из этой же группы (все ОСТАЛЬНЫЕ судьи, оценившие того же участника).
  const byContext = new Map<string, Map<string, { judgeUserId: string; normalized: number }[]>>();
  for (const item of items) {
    let byParticipant = byContext.get(item.contextKey);
    if (!byParticipant) {
      byParticipant = new Map();
      byContext.set(item.contextKey, byParticipant);
    }
    const list = byParticipant.get(item.drawParticipantId) ?? [];
    list.push({ judgeUserId: item.judgeUserId, normalized: item.normalized });
    byParticipant.set(item.drawParticipantId, list);
  }

  const ownScores = new Map<string, number[]>();
  const outlierFlags = new Map<string, boolean[]>();
  const correlations = new Map<string, number[]>();

  for (const byParticipant of byContext.values()) {
    const perJudgeInContext = new Map<string, Map<string, number>>(); // judgeUserId -> drawParticipantId -> value

    for (const [drawParticipantId, entries] of byParticipant) {
      for (const entry of entries) {
        if (!ownScores.has(entry.judgeUserId)) ownScores.set(entry.judgeUserId, []);
        ownScores.get(entry.judgeUserId)!.push(entry.normalized);

        const panel = entries.filter((e) => e.judgeUserId !== entry.judgeUserId).map((e) => e.normalized);
        if (panel.length > 0) {
          const panelMean = mean(panel)!;
          const panelStd = stdDev(panel)!;
          const isOutlier = panelStd > 0 ? Math.abs(entry.normalized - panelMean) > 2 * panelStd : entry.normalized !== panelMean;
          if (!outlierFlags.has(entry.judgeUserId)) outlierFlags.set(entry.judgeUserId, []);
          outlierFlags.get(entry.judgeUserId)!.push(isOutlier);
        }

        if (!perJudgeInContext.has(entry.judgeUserId)) perJudgeInContext.set(entry.judgeUserId, new Map());
        perJudgeInContext.get(entry.judgeUserId)!.set(drawParticipantId, entry.normalized);
      }
    }

    for (const [judgeUserId, own] of perJudgeInContext) {
      const ownValues: number[] = [];
      const panelMeans: number[] = [];
      for (const [drawParticipantId, value] of own) {
        const panel = (byParticipant.get(drawParticipantId) ?? []).filter((e) => e.judgeUserId !== judgeUserId).map((e) => e.normalized);
        if (panel.length === 0) continue;
        ownValues.push(value);
        panelMeans.push(mean(panel)!);
      }
      const correlation = spearmanCorrelation(ownValues, panelMeans);
      if (correlation !== null) {
        if (!correlations.has(judgeUserId)) correlations.set(judgeUserId, []);
        correlations.get(judgeUserId)!.push(correlation);
      }
    }
  }

  const distinctJudgeUserIds = [...new Set(assignments.map((a) => a.judgeUserId))];
  return distinctJudgeUserIds
    .map((judgeUserId) => {
      const own = ownScores.get(judgeUserId) ?? [];
      const outliers = outlierFlags.get(judgeUserId) ?? [];
      const judgeCorrelations = correlations.get(judgeUserId) ?? [];
      return {
        judgeUserId,
        judgeEmail: emailByJudgeUserId.get(judgeUserId) ?? judgeUserId,
        scoresCount: own.length,
        averageScore: mean(own),
        scoreStdDev: stdDev(own),
        panelAgreement: mean(judgeCorrelations),
        outlierRate: outliers.length > 0 ? outliers.filter(Boolean).length / outliers.length : null,
      };
    })
    .sort((a, b) => a.judgeEmail.localeCompare(b.judgeEmail));
}
