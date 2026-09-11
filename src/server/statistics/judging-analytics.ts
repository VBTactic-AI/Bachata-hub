import { prisma } from "@/lib/prisma";
import { requirePermission } from "../rbac/authorize";
import { mean } from "./stats-math";
import { REGISTRATION_ROLE_LABELS, ROUND_TYPE_LABELS } from "@/lib/competition-labels";
import { getJudgeStatisticsForCompetition } from "./judge-statistics";

// Расширенная аналитика судейства (2026-09-11, по прямому запросу
// пользователя) — дополняет getJudgeStatisticsForCompetition (per-судья
// метрики) видом "по соревнованию в целом": топ участников финала,
// профиль критериев по дивизионам, распределение сырых оценок, самые
// спорные/самые стабильные оценки участников, активность судей.
//
// RELATIVE_PLACEMENT (скейтинг-система, A27) сознательно исключён везде
// ниже, где речь о "сумме баллов"/"средней оценке": там единственный
// критерий хранит МЕСТО (1..N), а не качественную оценку — усреднять или
// суммировать место как будто это балл означало бы искажать смысл (меньше
// место — лучше, а не хуже).

function displayName(entity: { dancer: { displayName: string } | null; email: string } | null | undefined): string {
  return entity?.dancer?.displayName ?? entity?.email ?? "—";
}

// --- 1. Топ-10 участников финала (по прямому решению пользователя,
// 2026-09-11: БЕЗ разделения по ролям и БЕЗ нормализации по дивизионам —
// просто сумма баллов финала (FinalResult.totalScore, уже посчитана
// Ranking Engine'ом, A22) по убыванию. Осознанно смешивает дивизионы с
// разными критериями/шкалами — так попросил пользователь ("просто").
export type TopFinalParticipant = {
  registrationId: string;
  name: string;
  bibNumber: string | null;
  role: string;
  categoryName: string;
  totalScore: number;
  place: number | null;
};

export async function getTopFinalParticipants(competitionId: string, limit = 10): Promise<TopFinalParticipant[]> {
  await requirePermission("statistics:view", competitionId);

  const rows = await prisma.finalResult.findMany({
    where: {
      round: { division: { competitionId } },
      finalSession: { format: { not: "RELATIVE_PLACEMENT" } },
    },
    select: {
      registrationId: true,
      role: true,
      totalScore: true,
      place: true,
      registration: {
        select: {
          dancer: { select: { displayName: true } },
          checkIn: { select: { bibNumber: true } },
          division: { select: { category: { select: { name: true } } } },
        },
      },
    },
    orderBy: { totalScore: "desc" },
    take: limit,
  });

  return rows.map((r) => ({
    registrationId: r.registrationId,
    name: r.registration.dancer.displayName,
    bibNumber: r.registration.checkIn?.bibNumber ?? null,
    role: REGISTRATION_ROLE_LABELS[r.role] ?? r.role,
    categoryName: r.registration.division.category.name,
    totalScore: r.totalScore,
    place: r.place,
  }));
}

// --- 2. Профиль критериев по категориям (только там, где реально
// настроена и использована критериальная система финала — по прямому
// решению пользователя, 2026-09-11).
export type CategoryCriteriaProfile = {
  categoryName: string;
  criteria: { name: string; average: number; maxScore: number }[];
};

export async function getCriteriaProfile(competitionId: string): Promise<CategoryCriteriaProfile[]> {
  await requirePermission("statistics:view", competitionId);

  const rows = await prisma.finalJudgeScore.findMany({
    where: {
      criterion: { division: { competitionId } },
      drawParticipant: { draw: { heat: { round: { finalSession: { format: { not: "RELATIVE_PLACEMENT" } } } } } },
    },
    select: {
      value: true,
      criterion: { select: { name: true, maxScore: true, sortOrder: true, division: { select: { category: { select: { name: true } } } } } },
    },
  });

  const byCategory = new Map<string, Map<string, { values: number[]; maxScore: number; sortOrder: number }>>();
  for (const r of rows) {
    const categoryName = r.criterion.division.category.name;
    if (!byCategory.has(categoryName)) byCategory.set(categoryName, new Map());
    const byCriterion = byCategory.get(categoryName)!;
    if (!byCriterion.has(r.criterion.name)) {
      byCriterion.set(r.criterion.name, { values: [], maxScore: r.criterion.maxScore, sortOrder: r.criterion.sortOrder });
    }
    byCriterion.get(r.criterion.name)!.values.push(r.value);
  }

  return [...byCategory.entries()]
    .map(([categoryName, byCriterion]) => ({
      categoryName,
      criteria: [...byCriterion.entries()]
        .sort((a, b) => a[1].sortOrder - b[1].sortOrder)
        .map(([name, c]) => ({ name, average: mean(c.values) ?? 0, maxScore: c.maxScore })),
    }))
    .sort((a, b) => a.categoryName.localeCompare(b.categoryName, "ru"));
}

// --- 3+4. Распределение оценок + споры между судьями. Один общий проход
// по сырым оценкам (JudgeScore обычных раундов + FinalJudgeScore финалов,
// без RELATIVE_PLACEMENT) — чтобы не тянуть одни и те же строки из БД трижды.
type RawItem = {
  contextKey: string;
  contextLabel: string;
  registrationId: string;
  role: string;
  name: string;
  bibNumber: string | null;
  judgeUserId: string;
  judgeName: string;
  rawValue: number;
  rawMax: number;
  normalized: number; // 0..1, для сравнения между разными шкалами
};

async function collectRawScoreItems(competitionId: string): Promise<RawItem[]> {
  const [judgeScores, finalJudgeScores] = await Promise.all([
    prisma.judgeScore.findMany({
      where: { drawParticipant: { draw: { heat: { round: { division: { competitionId } } } } } },
      select: {
        value: true,
        maxValue: true,
        judgeAssignmentId: true,
        judgeAssignment: { select: { judgeUserId: true, judge: { select: { email: true, dancer: { select: { displayName: true } } } } } },
        drawParticipant: {
          select: {
            registrationId: true,
            role: true,
            registration: {
              select: {
                dancer: { select: { displayName: true } },
                checkIn: { select: { bibNumber: true } },
              },
            },
            draw: { select: { heat: { select: { round: { select: { id: true, type: true, stage: { select: { name: true } } } } } } } },
          },
        },
      },
    }),
    prisma.finalJudgeScore.findMany({
      where: {
        criterion: { division: { competitionId } },
        drawParticipant: { draw: { heat: { round: { finalSession: { format: { not: "RELATIVE_PLACEMENT" } } } } } },
      },
      select: {
        value: true,
        criterion: { select: { id: true, name: true, minScore: true, maxScore: true } },
        judgeAssignmentId: true,
        judgeAssignment: { select: { judgeUserId: true, judge: { select: { email: true, dancer: { select: { displayName: true } } } } } },
        drawParticipant: {
          select: {
            registrationId: true,
            role: true,
            registration: { select: { dancer: { select: { displayName: true } }, checkIn: { select: { bibNumber: true } } } },
          },
        },
      },
    }),
  ]);

  const items: RawItem[] = [];
  for (const s of judgeScores) {
    const round = s.drawParticipant.draw.heat.round;
    const contextLabel = round.type ? (ROUND_TYPE_LABELS[round.type] ?? round.type) : (round.stage?.name ?? "Этап");
    items.push({
      contextKey: `round:${round.id}#${s.drawParticipant.registrationId}`,
      contextLabel,
      registrationId: s.drawParticipant.registrationId,
      role: s.drawParticipant.role,
      name: s.drawParticipant.registration.dancer.displayName,
      bibNumber: s.drawParticipant.registration.checkIn?.bibNumber ?? null,
      judgeUserId: s.judgeAssignment.judgeUserId,
      judgeName: displayName(s.judgeAssignment.judge),
      rawValue: s.value,
      rawMax: s.maxValue,
      normalized: s.maxValue > 0 ? s.value / s.maxValue : 0,
    });
  }
  for (const s of finalJudgeScores) {
    const contextLabel = `Финал — ${s.criterion.name}`;
    const range = s.criterion.maxScore - s.criterion.minScore;
    items.push({
      contextKey: `criterion:${s.criterion.id}#${s.drawParticipant.registrationId}`,
      contextLabel,
      registrationId: s.drawParticipant.registrationId,
      role: s.drawParticipant.role,
      name: s.drawParticipant.registration.dancer.displayName,
      bibNumber: s.drawParticipant.registration.checkIn?.bibNumber ?? null,
      judgeUserId: s.judgeAssignment.judgeUserId,
      judgeName: displayName(s.judgeAssignment.judge),
      rawValue: s.value,
      rawMax: s.criterion.maxScore,
      normalized: range > 0 ? (s.value - s.criterion.minScore) / range : 0,
    });
  }
  return items;
}

// Гистограмма "как вообще оценивали" — все сырые оценки приведены к единой
// условной 10-балльной шкале (нормализованная доля × 10), чтобы раунды с
// разными шкалами (0/1, 0/2, критерии 1..10) можно было показать одним
// графиком. Это ТОЛЬКО про наглядность распределения, не про сравнение
// конкретных судей/участников.
export type ScoreDistributionBucket = { rangeLabel: string; count: number };

export async function getScoreDistribution(competitionId: string): Promise<ScoreDistributionBucket[]> {
  await requirePermission("statistics:view", competitionId);
  const items = await collectRawScoreItems(competitionId);

  const bucketRanges: [number, number, string][] = [
    [0, 2, "1–2"],
    [2, 4, "3–4"],
    [4, 6, "5–6"],
    [6, 8, "7–8"],
    [8, 10, "9–10"],
  ];
  const counts = new Array(bucketRanges.length).fill(0);
  for (const item of items) {
    const onTenScale = item.normalized * 10;
    const idx = bucketRanges.findIndex(([min, max], i) => (i === bucketRanges.length - 1 ? onTenScale >= min && onTenScale <= max : onTenScale >= min && onTenScale < max));
    counts[idx === -1 ? bucketRanges.length - 1 : idx]++;
  }
  return bucketRanges.map(([, , label], i) => ({ rangeLabel: label, count: counts[i] }));
}

export type DisputedScore = {
  contextLabel: string;
  registrationId: string;
  name: string;
  bibNumber: string | null;
  role: string;
  spread: number; // 0..1, размах нормализованных оценок (max-min)
  perJudge: { judgeName: string; rawValue: number; rawMax: number }[];
};

// Минимум судей, при котором вообще имеет смысл говорить о "споре" —
// с одним судьёй сравнивать не с чем.
const MIN_JUDGES_FOR_DISPUTE = 2;

async function buildDisputeGroups(competitionId: string) {
  const items = await collectRawScoreItems(competitionId);
  const byContext = new Map<string, RawItem[]>();
  for (const item of items) {
    const list = byContext.get(item.contextKey) ?? [];
    list.push(item);
    byContext.set(item.contextKey, list);
  }
  return [...byContext.values()].filter((g) => g.length >= MIN_JUDGES_FOR_DISPUTE);
}

function groupToDisputedScore(group: RawItem[]): DisputedScore {
  const normalized = group.map((g) => g.normalized);
  const spread = Math.max(...normalized) - Math.min(...normalized);
  const first = group[0];
  return {
    contextLabel: first.contextLabel,
    registrationId: first.registrationId,
    name: first.name,
    bibNumber: first.bibNumber,
    role: REGISTRATION_ROLE_LABELS[first.role] ?? first.role,
    spread,
    perJudge: [...group].sort((a, b) => b.rawValue - a.rawValue).map((g) => ({ judgeName: g.judgeName, rawValue: g.rawValue, rawMax: g.rawMax })),
  };
}

// Самые спорные оценки (судьи разошлись сильнее всего) и самые стабильные
// (судьи почти единодушны) — пример из запроса пользователя: "Участник №17:
// судья1→10, судья2→9, судья3→9, судья4→5, судья5→9" — один судья сильно
// отличился, это и есть высокий spread.
export async function getScoreDisputes(
  competitionId: string,
  limit = 5
): Promise<{ mostControversial: DisputedScore[]; mostConsistent: DisputedScore[] }> {
  await requirePermission("statistics:view", competitionId);
  const groups = await buildDisputeGroups(competitionId);
  const scored = groups.map(groupToDisputedScore);

  const mostControversial = [...scored].sort((a, b) => b.spread - a.spread).slice(0, limit);
  const mostConsistent = [...scored].sort((a, b) => a.spread - b.spread).slice(0, limit);
  return { mostControversial, mostConsistent };
}

// --- 5. Активность судей: сколько раундов судья реально начал оценивать
// (есть хотя бы одна его JudgeScore) и сколько из них уже подтвердил
// ("Готово", JudgeRoundConfirmation, A21). Ограничено ОБЫЧНЫМИ раундами —
// у финала своя модель подтверждения (JudgeHeatConfirmation, A22), сюда
// сознательно не подмешана, чтобы не считать её неточно.
export type JudgeActivity = {
  judgeUserId: string;
  judgeName: string;
  roundsTouched: number;
  roundsConfirmed: number;
  finished: boolean;
};

export async function getJudgeActivity(competitionId: string): Promise<JudgeActivity[]> {
  await requirePermission("statistics:view", competitionId);

  const assignments = await prisma.judgeAssignment.findMany({
    where: { division: { competitionId } },
    select: {
      id: true,
      judgeUserId: true,
      judge: { select: { email: true, dancer: { select: { displayName: true } } } },
      scores: { select: { drawParticipant: { select: { draw: { select: { heat: { select: { roundId: true } } } } } } } },
      confirmations: { select: { roundId: true } },
    },
  });
  if (assignments.length === 0) return [];

  const byJudge = new Map<string, { name: string; touched: Set<string>; confirmed: Set<string> }>();
  for (const a of assignments) {
    if (!byJudge.has(a.judgeUserId)) byJudge.set(a.judgeUserId, { name: displayName(a.judge), touched: new Set(), confirmed: new Set() });
    const entry = byJudge.get(a.judgeUserId)!;
    for (const s of a.scores) entry.touched.add(s.drawParticipant.draw.heat.roundId);
    for (const c of a.confirmations) {
      entry.touched.add(c.roundId);
      entry.confirmed.add(c.roundId);
    }
  }

  return [...byJudge.entries()]
    .map(([judgeUserId, e]) => ({
      judgeUserId,
      judgeName: e.name,
      roundsTouched: e.touched.size,
      roundsConfirmed: e.confirmed.size,
      finished: e.touched.size > 0 && e.confirmed.size === e.touched.size,
    }))
    .sort((a, b) => a.judgeName.localeCompare(b.judgeName, "ru"));
}

// --- 6. Согласованность судей в целом по соревнованию — то же самое
// "согласие с панелью" (-1..1), что уже посчитано на судью
// (getJudgeStatisticsForCompetition, A24), просто взвешенное среднее по
// всем судьям сразу (вес — число оценок судьи, чтобы судья с 5 оценками не
// значил столько же, сколько судья со 150). Переиспользует уже сделанный
// запрос, а не считает раздельно — не тянет одни и те же строки из БД дважды.
export type JudgingConsensus = {
  /** -1..1, взвешенное среднее panelAgreement — форматировать теми же
   * agreementPercentLabel/agreementBand, что и у отдельного судьи, чтобы
   * шкала не разъезжалась. */
  agreement: number | null;
  /** 0..1, взвешенное среднее scoreStdDev — форматировать spreadBand. */
  spread: number | null;
};

export async function getJudgingConsensus(competitionId: string): Promise<JudgingConsensus> {
  const judges = await getJudgeStatisticsForCompetition(competitionId);

  function weightedMean(pick: (j: (typeof judges)[number]) => number | null): number | null {
    const withWeight = judges.filter((j) => pick(j) !== null && j.scoresCount > 0);
    const totalWeight = withWeight.reduce((sum, j) => sum + j.scoresCount, 0);
    if (totalWeight === 0) return null;
    return withWeight.reduce((sum, j) => sum + pick(j)! * j.scoresCount, 0) / totalWeight;
  }

  return {
    agreement: weightedMean((j) => j.panelAgreement),
    spread: weightedMean((j) => j.scoreStdDev),
  };
}

// --- 7. Ключевые показатели (2026-09-11, по референсу дизайна пользователя) —
// короткая сводка "самое-самое" для верхней панели вкладки. Переиспользует
// уже посчитанные getJudgeStatisticsForCompetition/collectRawScoreItems, не
// делает отдельных тяжёлых запросов.
export type JudgingHighlights = {
  topAverageJudge: { judgeName: string; averageScore: number } | null;
  mostActiveJudge: { judgeName: string; scoresCount: number } | null;
  highestSingleScore: { name: string; bibNumber: string | null; contextLabel: string; rawValue: number; rawMax: number } | null;
  mostStableParticipant: { name: string; bibNumber: string | null; contextLabel: string; spread: number } | null;
};

export async function getJudgingHighlights(competitionId: string): Promise<JudgingHighlights> {
  const [judges, groups] = await Promise.all([getJudgeStatisticsForCompetition(competitionId), buildDisputeGroups(competitionId)]);

  const judgesByAverage = judges.filter((j) => j.averageScore !== null).sort((a, b) => b.averageScore! - a.averageScore!);
  const judgesByCount = [...judges].sort((a, b) => b.scoresCount - a.scoresCount);

  let highestItem: RawItem | null = null;
  for (const group of groups) {
    for (const item of group) {
      if (!highestItem || item.normalized > highestItem.normalized) highestItem = item;
    }
  }

  const mostStable = groups.map(groupToDisputedScore).sort((a, b) => a.spread - b.spread)[0] ?? null;

  return {
    topAverageJudge: judgesByAverage[0] ? { judgeName: judgesByAverage[0].judgeName, averageScore: judgesByAverage[0].averageScore! } : null,
    mostActiveJudge: judgesByCount[0] && judgesByCount[0].scoresCount > 0 ? { judgeName: judgesByCount[0].judgeName, scoresCount: judgesByCount[0].scoresCount } : null,
    highestSingleScore: highestItem
      ? { name: highestItem.name, bibNumber: highestItem.bibNumber, contextLabel: highestItem.contextLabel, rawValue: highestItem.rawValue, rawMax: highestItem.rawMax }
      : null,
    mostStableParticipant: mostStable ? { name: mostStable.name, bibNumber: mostStable.bibNumber, contextLabel: mostStable.contextLabel, spread: mostStable.spread } : null,
  };
}

// --- 8. Сравнение участников по критериям — тепловая таблица (2026-09-11,
// по референсу дизайна пользователя). ТОЛЬКО в пределах одной категории —
// в отличие от топ-10 (сознательно смешивает дивизионы по прямому решению
// пользователя), здесь колонки — это конкретные критерии конкретной
// категории, смешивать их между категориями с разными критериями/шкалами
// было бы уже не "просто сумма", а откровенно неверным сравнением разных
// единиц измерения.
export type CriteriaComparisonRow = {
  registrationId: string;
  name: string;
  bibNumber: string | null;
  role: string;
  total: number;
  values: (number | null)[]; // по одному на каждый criteriaNames[i]
};
export type CategoryCriteriaComparison = {
  categoryName: string;
  criteriaNames: string[];
  maxScore: number;
  rows: CriteriaComparisonRow[];
};

export async function getCriteriaComparisonTable(competitionId: string, limitPerCategory = 6): Promise<CategoryCriteriaComparison[]> {
  await requirePermission("statistics:view", competitionId);

  const rows = await prisma.finalResult.findMany({
    where: {
      round: { division: { competitionId } },
      finalSession: { format: { not: "RELATIVE_PLACEMENT" } },
    },
    select: {
      registrationId: true,
      role: true,
      totalScore: true,
      criteriaTotals: true,
      registration: {
        select: {
          dancer: { select: { displayName: true } },
          checkIn: { select: { bibNumber: true } },
          division: {
            select: {
              category: { select: { name: true } },
              finalCriteria: { select: { id: true, name: true, maxScore: true, sortOrder: true, isActive: true } },
            },
          },
        },
      },
    },
    orderBy: { totalScore: "desc" },
  });

  const byCategory = new Map<string, { criteria: { id: string; name: string; maxScore: number }[]; rows: CriteriaComparisonRow[] }>();
  for (const r of rows) {
    const categoryName = r.registration.division.category.name;
    const criteria = [...r.registration.division.finalCriteria]
      .filter((c) => c.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    if (criteria.length === 0) continue; // не критериальный финал — сравнивать нечего

    if (!byCategory.has(categoryName)) byCategory.set(categoryName, { criteria, rows: [] });
    const entry = byCategory.get(categoryName)!;
    const totals = (r.criteriaTotals ?? {}) as Record<string, number>;
    if (entry.rows.length >= limitPerCategory) continue;
    entry.rows.push({
      registrationId: r.registrationId,
      name: r.registration.dancer.displayName,
      bibNumber: r.registration.checkIn?.bibNumber ?? null,
      role: REGISTRATION_ROLE_LABELS[r.role] ?? r.role,
      total: r.totalScore,
      values: criteria.map((c) => totals[c.id] ?? null),
    });
  }

  return [...byCategory.entries()]
    .map(([categoryName, entry]) => ({
      categoryName,
      criteriaNames: entry.criteria.map((c) => c.name),
      maxScore: Math.max(1, ...entry.criteria.map((c) => c.maxScore)),
      rows: entry.rows,
    }))
    .sort((a, b) => a.categoryName.localeCompare(b.categoryName, "ru"));
}
