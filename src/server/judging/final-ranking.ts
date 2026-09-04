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
