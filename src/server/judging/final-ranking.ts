import type { RegistrationRole } from "@prisma/client";

// Чистый ranking engine финала (Этап 9, docs/00_DECISIONS.md, A22).
//
// КРИТИЧЕСКИ ВАЖНО (по прямому требованию пользователя, 2026-09-04):
// "приоритет" критерия — НЕ коэффициент. Оценки НЕ умножаются на вес и НЕ
// нормализуются — totalScore всегда простая сумма criteriaTotals. Приоритет
// используется ТОЛЬКО как порядок сравнения критериев при полном равенстве
// общей суммы (лексикографический tie-break: сначала критерий с priority=1,
// если равны — priority=2, и так далее). Это НЕ Relative Placement и НЕ
// weighted score.
//
// Полное равенство totalScore И всех критериев по порядку приоритета —
// НЕ разрешается автоматически (CLAUDE.md §19-20/§60): такая группа
// участников помечается общим tieGroupKey, place остаётся null, пока
// HEAD_JUDGE/EVENT_ADMIN не внесёт коллегиальное решение перетанцовки
// (resolveTieGroupPlaces — RANK_ALL, CLAUDE.md §22).

export type FinalCriterionPriority = { id: string; priority: number };

export type FinalParticipantScores = {
  registrationId: string;
  role: RegistrationRole;
  criteriaTotals: Record<string, number>; // criterionId -> сумма оценок ВСЕХ судей по этому критерию
};

export type RankedFinalParticipant = FinalParticipantScores & {
  totalScore: number;
  place: number | null; // null, пока группа ждёт решения перетанцовки
  tieGroupKey: string | null;
};

export type FinalTieGroup = {
  key: string;
  startPlace: number; // первое место диапазона, который занимает эта группа (напр. группа из 2 на границе #3 занимает { startPlace: 3 } -> места 3 и 4)
  registrationIds: string[];
};

export type FinalRankingResult = {
  ranked: RankedFinalParticipant[];
  tieGroups: FinalTieGroup[];
};

function compareParticipants(
  totalA: number,
  totalB: number,
  a: FinalParticipantScores,
  b: FinalParticipantScores,
  orderedCriteriaIds: string[]
): number {
  if (totalA !== totalB) return totalB - totalA; // total DESC
  for (const criterionId of orderedCriteriaIds) {
    const av = a.criteriaTotals[criterionId] ?? 0;
    const bv = b.criteriaTotals[criterionId] ?? 0;
    if (av !== bv) return bv - av; // критерий приоритета DESC
  }
  return 0; // total и ВСЕ критерии совпали — полная ничья
}

// Ранжирует финалистов. Роли считаются ОТДЕЛЬНО (подтверждено пользователем,
// 2026-09-04) — вызывающий код должен передавать участников одной роли за
// раз (как splitByCutoff в advancement.ts делает для обычных раундов).
// criteria — список критериев дивизиона; порядок в массиве не важен,
// функция сама сортирует по priority.
export function rankFinalParticipants(
  participants: FinalParticipantScores[],
  criteria: FinalCriterionPriority[]
): FinalRankingResult {
  const orderedCriteriaIds = [...criteria].sort((a, b) => a.priority - b.priority).map((c) => c.id);

  const withTotals = participants.map((p) => ({
    participant: p,
    totalScore: Object.values(p.criteriaTotals).reduce((sum, v) => sum + v, 0),
  }));

  withTotals.sort((x, y) => compareParticipants(x.totalScore, y.totalScore, x.participant, y.participant, orderedCriteriaIds));

  const ranked: RankedFinalParticipant[] = [];
  const tieGroups: FinalTieGroup[] = [];

  let i = 0;
  while (i < withTotals.length) {
    let j = i + 1;
    while (
      j < withTotals.length &&
      compareParticipants(withTotals[i].totalScore, withTotals[j].totalScore, withTotals[i].participant, withTotals[j].participant, orderedCriteriaIds) === 0
    ) {
      j++;
    }
    const group = withTotals.slice(i, j);
    if (group.length === 1) {
      const { participant, totalScore } = group[0];
      ranked.push({ ...participant, totalScore, place: i + 1, tieGroupKey: null });
    } else {
      const key = `tie-${i + 1}-${j}`;
      tieGroups.push({ key, startPlace: i + 1, registrationIds: group.map((w) => w.participant.registrationId) });
      for (const w of group) {
        ranked.push({ ...w.participant, totalScore: w.totalScore, place: null, tieGroupKey: key });
      }
    }
    i = j;
  }

  return { ranked, tieGroups };
}

// Relative Placement / "скейтинг-система" (CLAUDE.md §18) — второй, отдельный
// ranking engine финала: судьи ставят место НАПРЯМУЮ (1..N, без повторов у
// одного судьи в рамках роли — проверяется при отправке оценки,
// final-scoring.ts), а не сумму баллов по критериям. НЕЛЬЗЯ подменять
// average(мест) — CLAUDE.md §18/§60 прямо запрещает. Алгоритм классический
// (используется в бальных танцах/фигурном катании):
//
// 1. Для каждого участника ищем наименьшее место P (от 1 до N), на котором
//    у него набралось БОЛЬШИНСТВО судейских голосов (голос засчитан, если
//    судья поставил участнику место <= P). Это его "уровень разрешения".
// 2. Меньший уровень разрешения — выше итоговое место.
// 3. При равном уровне — сравниваем КОЛИЧЕСТВО судейских оценок <= уровня
//    разрешения ("majority count") — БОЛЬШЕ судей согласилось, выше место.
//    Это ошибочно отсутствовало до 2026-09-07: раньше тай-брейк сразу
//    прыгал на сумму мест, из-за чего участник с большинством ВСЕХ судей
//    в его пользу мог проиграть участнику, у которого согласилось меньше
//    судей, но с меньшей суммой. Реальный кейс (см. docs/00_DECISIONS.md):
//    при 4 судьях, N=6, уровень=3 — у одного участника счёт 4/4 (сумма 10),
//    у другого 3/4 (сумма 6, четвёртый судья дал место вне уровня) —
//    классическая скейтинг-система отдаёт место первому (4 > 3), а не
//    второму по меньшей сумме.
// 4. Если И уровень, И количество совпали — тогда сравниваем СУММУ мест
//    (только тех судейских оценок, что <= уровня разрешения) — меньше
//    сумма, выше место ("corrected sum", стандартный tie-break скейтинг-
//    системы).
// 5. Полное совпадение уровня, количества И суммы — настоящая ничья: место
//    не присваивается (tieGroupKey), как и в rankFinalParticipants выше —
//    решается через resolveTieGroupPlaces, не автоматически (CLAUDE.md §19-20).

export type FinalParticipantPlacements = {
  registrationId: string;
  role: RegistrationRole;
  judgePlacements: Record<string, number>; // judgeAssignmentId -> место (1..N), поставленное этим судьёй
};

export type RankedFinalParticipantByPlacement = FinalParticipantPlacements & {
  majorityPlace: number; // уровень разрешения — не итоговое место, а диагностическая величина (CLAUDE.md §63 — организатор должен понимать, почему система приняла решение)
  place: number | null;
  tieGroupKey: string | null;
};

export type FinalRankingResultByPlacement = {
  ranked: RankedFinalParticipantByPlacement[];
  tieGroups: FinalTieGroup[];
};

function placementsAtOrBetter(placements: Record<string, number>, p: number): number[] {
  return Object.values(placements).filter((v) => v <= p);
}

function resolutionLevel(placements: Record<string, number>, judgeCount: number, n: number): number {
  const majority = Math.floor(judgeCount / 2) + 1;
  for (let p = 1; p <= n; p++) {
    if (placementsAtOrBetter(placements, p).length >= majority) return p;
  }
  return n; // при полном наборе оценок (каждый судья расставил всех 1..N) большинство гарантированно набирается не позже N
}

function comparePlacementParticipants(
  a: FinalParticipantPlacements,
  b: FinalParticipantPlacements,
  judgeCount: number,
  n: number
): number {
  const levelA = resolutionLevel(a.judgePlacements, judgeCount, n);
  const levelB = resolutionLevel(b.judgePlacements, judgeCount, n);
  if (levelA !== levelB) return levelA - levelB; // меньший уровень разрешения — выше место

  const atLevelA = placementsAtOrBetter(a.judgePlacements, levelA);
  const atLevelB = placementsAtOrBetter(b.judgePlacements, levelB);
  if (atLevelA.length !== atLevelB.length) return atLevelB.length - atLevelA.length; // больше судей в зачёте на этом уровне — выше место

  const sumA = atLevelA.reduce((s, v) => s + v, 0);
  const sumB = atLevelB.reduce((s, v) => s + v, 0);
  return sumA - sumB; // меньшая сумма — выше место (только когда и уровень, и количество совпали)
}

// Роли считаются ОТДЕЛЬНО, как и rankFinalParticipants — вызывающий код
// передаёт участников одной роли за раз.
export function rankFinalParticipantsBySkatingSystem(participants: FinalParticipantPlacements[]): FinalRankingResultByPlacement {
  const n = participants.length;
  const judgeIds = new Set<string>();
  for (const p of participants) for (const judgeId of Object.keys(p.judgePlacements)) judgeIds.add(judgeId);
  const judgeCount = judgeIds.size;

  const withLevel = participants
    .map((p) => ({ participant: p, level: resolutionLevel(p.judgePlacements, judgeCount, n) }))
    .sort((x, y) => comparePlacementParticipants(x.participant, y.participant, judgeCount, n));

  const ranked: RankedFinalParticipantByPlacement[] = [];
  const tieGroups: FinalTieGroup[] = [];

  let i = 0;
  while (i < withLevel.length) {
    let j = i + 1;
    while (j < withLevel.length && comparePlacementParticipants(withLevel[i].participant, withLevel[j].participant, judgeCount, n) === 0) {
      j++;
    }
    const group = withLevel.slice(i, j);
    if (group.length === 1) {
      const { participant, level } = group[0];
      ranked.push({ ...participant, majorityPlace: level, place: i + 1, tieGroupKey: null });
    } else {
      const key = `tie-skate-${i + 1}-${j}`;
      tieGroups.push({ key, startPlace: i + 1, registrationIds: group.map((w) => w.participant.registrationId) });
      for (const w of group) {
        ranked.push({ ...w.participant, majorityPlace: w.level, place: null, tieGroupKey: key });
      }
    }
    i = j;
  }

  return { ranked, tieGroups };
}

// Вносит коллегиальное решение перетанцовки (RANK_ALL, CLAUDE.md §22) —
// судьи вслух обсудили и целиком расставили tie-группу по местам,
// orderedRegistrationIds — от лучшего к худшему. НЕ выбор N прошедших
// (SELECT_N, как в обычной перетанцовке advancement.ts) — здесь у всех
// участников группы уже есть место в финале, нужно только разрешить их
// внутренний порядок.
export function resolveTieGroupPlaces(
  tieGroup: FinalTieGroup,
  orderedRegistrationIds: string[]
): { registrationId: string; place: number }[] {
  if (orderedRegistrationIds.length !== tieGroup.registrationIds.length) {
    throw new Error(`Нужно расставить всех участников группы (${tieGroup.registrationIds.length}) — получено ${orderedRegistrationIds.length}.`);
  }
  const expected = new Set(tieGroup.registrationIds);
  for (const id of orderedRegistrationIds) {
    if (!expected.has(id)) throw new Error("В порядке есть участник, которого не было в этой tie-группе.");
  }
  if (new Set(orderedRegistrationIds).size !== orderedRegistrationIds.length) {
    throw new Error("В порядке есть повторяющийся участник.");
  }
  return orderedRegistrationIds.map((registrationId, idx) => ({ registrationId, place: tieGroup.startPlace + idx }));
}
