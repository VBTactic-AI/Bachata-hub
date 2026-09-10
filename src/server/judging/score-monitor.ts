import type { FinalFormat, RegistrationRole, RoundStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "../rbac/authorize";
import { isFinalStageInTx, rolesNotNeedingJudging } from "./advancement";
import { allowedJudgeRole } from "./final-scoring-matrix";

// Live-таблица оценок для head judge/admin (CLAUDE.md §35, score:view_all —
// уже выдано EVENT_ADMIN/HEAD_JUDGE/SCORER и НЕ выдано JUDGE, новое право не
// нужно): строки — номера участников (без имени), столбцы — судьи (имя без
// email), в ячейках — их оценки. Читает ровно те же данные, что и обычный
// судейский экран (getJudgeQueue/getFinalJudgeQueue) — просто по ВСЕМ судьям
// роли сразу, а не только "своим". Ничего не пишет и не решает сама —
// чистое чтение поверх уже посчитанных JudgeScore/FinalJudgeScore.

export type ScoreMonitorJudgeColumn = {
  judgeAssignmentId: string;
  displayName: string;
  // true, если у судьи нет профиля танцора (Dancer) с именем — тогда
  // displayName это часть email до "@", видимая заглушка, а не осознанное
  // решение (assignJudge не требует профиля Dancer, см. judge-assignment.ts).
  isEmailFallback: boolean;
};

export type ScoreMonitorTotal = {
  judgeAssignmentId: string;
  required: number;
  submitted: number;
  complete: boolean;
  // Только для форматов "Да/Нет"/"0/1/2" (Round.judgingMaxScore 1 или 2) —
  // нажал ли судья кнопку "Готово" (confirmJudgeRoundDone, scoring.ts).
  // undefined для обычной числовой шкалы, где такой кнопки нет вовсе.
  confirmed?: boolean;
};

function judgeDisplayName(judge: { email: string; dancer: { displayName: string } | null }): {
  displayName: string;
  isEmailFallback: boolean;
} {
  if (judge.dancer) return { displayName: judge.dancer.displayName, isEmailFallback: false };
  return { displayName: judge.email.split("@")[0], isEmailFallback: true };
}

const JUDGE_SELECT = { email: true, dancer: { select: { displayName: true } } } as const;

// ---------------------------------------------------------------------------
// Обычные раунды (JudgeScore)
// ---------------------------------------------------------------------------

export type PrelimScoreMonitorTable = {
  judges: ScoreMonitorJudgeColumn[];
  rows: { drawParticipantId: string; bibNumber: string | null; scores: Record<string, number | null> }[];
  totals: ScoreMonitorTotal[];
  // Роль не нужно оценивать в этом раунде — реальных участников этой роли не
  // больше, чем мест, все и так проходят дальше (rolesNotNeedingJudging,
  // draw-engine.ts). Таблица без этого флага показывала пустую сетку
  // прочерков ("—" по каждому судье у каждого участника) — выглядело так,
  // будто судьи просто забыли оценить, хотя оценивать было и не нужно
  // (жалоба пользователя, 2026-09-10).
  notJudged: boolean;
};

export type PrelimScoreMonitor = {
  maxValue: number;
  // Клиенту нужно для пересчёта ИТОГО на живых событиях (Realtime), не
  // дожидаясь полного пересинка с сервера — та же величина, что определяет
  // "положительная оценка / сколько должно пройти дальше" ниже.
  finalistsCount: number;
  leader: PrelimScoreMonitorTable;
  follower: PrelimScoreMonitorTable;
};

export async function getPrelimScoreMonitor(roundId: string): Promise<PrelimScoreMonitor> {
  const round = await prisma.round.findUniqueOrThrow({
    where: { id: roundId },
    select: {
      divisionId: true,
      finalistsCount: true,
      order: true,
      type: true,
      judgingMaxScore: true,
      division: { select: { competitionId: true } },
    },
  });
  await requirePermission("score:view_all", round.division.competitionId);

  const heats = await prisma.heat.findMany({
    where: { roundId },
    select: {
      draws: {
        orderBy: { version: "desc" },
        take: 1,
        select: {
          participants: {
            where: { scored: true },
            select: {
              id: true,
              role: true,
              registration: { select: { checkIn: { select: { bibNumber: true } } } },
              judgeScores: { select: { judgeAssignmentId: true, value: true } },
            },
          },
        },
      },
    },
  });
  const participants = heats.flatMap((h) => h.draws[0]?.participants ?? []);

  const roleCounts: Record<RegistrationRole, number> = { LEADER: 0, FOLLOWER: 0 };
  for (const p of participants) roleCounts[p.role]++;
  const isFinal = await isFinalStageInTx(prisma, round.divisionId, round.order);
  const skippedRoles = rolesNotNeedingJudging(roleCounts, round.finalistsCount ?? 0, isFinal, round.type);

  const assignments = await prisma.judgeAssignment.findMany({
    where: { divisionId: round.divisionId },
    select: { id: true, role: true, judge: { select: JUDGE_SELECT } },
    orderBy: { createdAt: "asc" },
  });

  // Форматы "Да/Нет" и "0/1/2" — судья считается сдавшим не по сырым кликам,
  // а по явному "Готово" (JudgeRoundConfirmation) — та же логика, что и
  // getRoundScoringProgress (advancement.ts), но здесь нужна ПО КАЖДОМУ
  // судье отдельно (для столбца в ИТОГО), а не одной суммой на раунд — так
  // что считаем сами поверх уже загруженных данных, не трогая advancement.ts.
  const isConfirmationBased = (round.judgingMaxScore === 1 || round.judgingMaxScore === 2) && (round.finalistsCount ?? 0) > 0;
  const confirmedAssignmentIds = new Set(
    assignments.length === 0
      ? []
      : (
          await prisma.judgeRoundConfirmation.findMany({
            where: { roundId, judgeAssignmentId: { in: assignments.map((a) => a.id) } },
            select: { judgeAssignmentId: true },
          })
        ).map((c) => c.judgeAssignmentId)
  );

  function buildTable(role: RegistrationRole): PrelimScoreMonitorTable {
    const roleAssignments = assignments.filter((a) => a.role === role);
    const roleParticipants = [...participants.filter((p) => p.role === role)].sort(
      (a, b) => Number(a.registration.checkIn?.bibNumber ?? 0) - Number(b.registration.checkIn?.bibNumber ?? 0)
    );

    const judges = roleAssignments.map((a) => ({ judgeAssignmentId: a.id, ...judgeDisplayName(a.judge) }));

    const rows = roleParticipants.map((p) => ({
      drawParticipantId: p.id,
      bibNumber: p.registration.checkIn?.bibNumber ?? null,
      scores: Object.fromEntries(
        roleAssignments.map((a) => [a.id, p.judgeScores.find((s) => s.judgeAssignmentId === a.id)?.value ?? null])
      ),
    }));

    // ИТОГО для форматов "Да/Нет"/"0/1/2" показывает "сколько ПОЛОЖИТЕЛЬНЫХ
    // оценок судья уже поставил / сколько должно пройти дальше"
    // (Round.finalistsCount), а не "скольких участников вообще оценил из
    // скольких всего" — иначе табло показывало бы "7/7" (все 7 участников
    // оценены, из них 1 нулевая) вместо реального прогресса к нужному числу
    // проходящих (найдено пользователем на живом табло, 2026-09-07). Та же
    // величина, что судья видит на своём экране (JudgeScoreButtons/
    // ScoreQuotaCounter, scoring.ts) — "0" не считается положительной
    // оценкой, для шкалы 0/1/2 "1" и "2" считаются вместе (детальный разбор
    // по уровням — только на экране самого судьи). Раунд по-прежнему
    // завершается только по явному "Готово" (confirmJudgeRoundDone,
    // scoring.ts) — здесь это не меняется, только отображение на мониторе.
    const totals: ScoreMonitorTotal[] = roleAssignments.map((a) => {
      const confirmed = isConfirmationBased ? confirmedAssignmentIds.has(a.id) : undefined;
      if (skippedRoles.has(role)) return { judgeAssignmentId: a.id, required: 0, submitted: 0, complete: true, confirmed };
      if (isConfirmationBased) {
        const required = round.finalistsCount ?? 0;
        const submitted = roleParticipants.filter((p) => {
          const score = p.judgeScores.find((s) => s.judgeAssignmentId === a.id);
          return score !== undefined && score.value > 0;
        }).length;
        return { judgeAssignmentId: a.id, required, submitted, complete: submitted === required, confirmed };
      }
      const required = roleParticipants.length;
      const submitted = roleParticipants.filter((p) => p.judgeScores.some((s) => s.judgeAssignmentId === a.id)).length;
      return { judgeAssignmentId: a.id, required, submitted, complete: submitted >= required, confirmed };
    });

    return { judges, rows, totals, notJudged: skippedRoles.has(role) };
  }

  return {
    maxValue: round.judgingMaxScore,
    finalistsCount: round.finalistsCount ?? 0,
    leader: buildTable("LEADER"),
    follower: buildTable("FOLLOWER"),
  };
}

// ---------------------------------------------------------------------------
// Финалы (FinalJudgeScore, критерии вместо единой шкалы)
// ---------------------------------------------------------------------------

type CriterionSnapshot = { id: string; name: string; priority: number; minScore: number; maxScore: number; step: number };

export type FinalScoreMonitorTable = {
  criteria: { id: string; name: string }[];
  // criteriaIds — КАКИЕ из criteria этот конкретный судья реально оценивает
  // у этой роли участников (allowedJudgeRole, final-scoring-matrix.ts) — в
  // JUDGES_DANCE у разных судей на одну и ту же роль участника разный набор
  // (жалоба пользователя, 2026-09-10: судья-партнёрша в таблице партнёров
  // показывала ВСЕ критерии, хотя реально оценивает только один — "она
  // появилась со всеми критериями"). Вынесено на сервер (не в React,
  // CLAUDE.md §48), чтобы клиент рендерил только применимые столбцы, не
  // вычисляя allowedJudgeRole сам.
  judges: (ScoreMonitorJudgeColumn & { criteriaIds: string[] })[];
  // judgeAssignmentId -> criterionId -> значение. null означает и "ещё не
  // оценено", и "этот судья не оценивает этот критерий у этого участника"
  // (JUDGES_DANCE, allowedJudgeRole) — таблица намеренно не различает эти
  // два случая отдельным флагом (ячейка просто остаётся пустой в обоих).
  rows: { drawParticipantId: string; bibNumber: string | null; scores: Record<string, Record<string, number | null>> }[];
  totals: ScoreMonitorTotal[];
};

export type FinalScoreMonitor = { format: FinalFormat; leader: FinalScoreMonitorTable; follower: FinalScoreMonitorTable };

export async function getFinalScoreMonitor(roundId: string): Promise<FinalScoreMonitor | null> {
  const round = await prisma.round.findUniqueOrThrow({
    where: { id: roundId },
    select: {
      divisionId: true,
      division: { select: { competitionId: true } },
      finalSession: { select: { format: true, config: true, criteriaSnapshot: true } },
    },
  });
  await requirePermission("score:view_all", round.division.competitionId);
  if (!round.finalSession) return null;

  const criteria = [...(round.finalSession.criteriaSnapshot as unknown as CriterionSnapshot[])].sort((a, b) => a.priority - b.priority);
  const format = round.finalSession.format;
  const config = round.finalSession.config;

  const heats = await prisma.heat.findMany({
    where: { roundId },
    select: {
      id: true,
      draws: {
        orderBy: { version: "desc" },
        take: 1,
        select: {
          participants: {
            where: { scored: true },
            select: {
              id: true,
              role: true,
              registration: { select: { checkIn: { select: { bibNumber: true } } } },
              finalJudgeScores: { select: { judgeAssignmentId: true, criterionId: true, value: true } },
            },
          },
        },
      },
    },
  });
  const participants = heats.flatMap((h) => (h.draws[0]?.participants ?? []).map((p) => ({ ...p, heatId: h.id })));

  const assignments = await prisma.judgeAssignment.findMany({
    where: { divisionId: round.divisionId },
    select: { id: true, role: true, judge: { select: JUDGE_SELECT } },
    orderBy: { createdAt: "asc" },
  });

  // "Готово" — по-разному, в зависимости от формата (та же развилка, что и
  // в submitFinalJudgeScore/getFinalScoringProgressInTx):
  // JUDGES_DANCE подтверждает ПО ЗАХОДУ (JudgeHeatConfirmation) — заходы
  // стадий формируются не все сразу, "на весь раунд" (JudgeRoundConfirmation)
  // для этого формата больше не пишется вовсе. Раньше монитор здесь всегда
  // читал JudgeRoundConfirmation — для JUDGES_DANCE она пустая, галочка
  // "✓ Готово" никогда не появлялась, даже когда судья реально нажал
  // "Готово" по каждому своему заходу (жалоба пользователя, 2026-09-10).
  // Остальные форматы (NORMAL/RANDOM_COUPLES/RELATIVE_PLACEMENT) формируют
  // все заходы сразу — для них подтверждение по-прежнему на весь раунд, без
  // изменений (2026-09-07).
  const confirmedAssignmentIds =
    format === "JUDGES_DANCE"
      ? new Set<string>()
      : new Set(
          assignments.length === 0
            ? []
            : (
                await prisma.judgeRoundConfirmation.findMany({
                  where: { roundId, judgeAssignmentId: { in: assignments.map((a) => a.id) } },
                  select: { judgeAssignmentId: true },
                })
              ).map((c) => c.judgeAssignmentId)
        );
  const confirmedHeatPairs =
    format !== "JUDGES_DANCE"
      ? new Set<string>()
      : new Set(
          assignments.length === 0
            ? []
            : (
                await prisma.judgeHeatConfirmation.findMany({
                  where: { heatId: { in: heats.map((h) => h.id) }, judgeAssignmentId: { in: assignments.map((a) => a.id) } },
                  select: { heatId: true, judgeAssignmentId: true },
                })
              ).map((c) => `${c.heatId}:${c.judgeAssignmentId}`)
        );

  function buildTable(role: RegistrationRole): FinalScoreMonitorTable {
    // CODE-003 (жалоба пользователя, 2026-09-10, живой тест JUDGES_DANCE):
    // раньше колонки судей набирались просто по assignments.role === role
    // (роль УЧАСТНИКА) — верно для NORMAL/RANDOM_COUPLES/RELATIVE_PLACEMENT
    // (там судья своей роли и оценивает свою роль), но НЕ для JUDGES_DANCE:
    // "танцующего" судью критериев из dancingJudgeCriteriaIds участнику
    // назначает ПРОТИВОПОЛОЖНАЯ роль (allowedJudgeRole, final-scoring-matrix.ts)
    // — партнёров на паркете физически судит судья-партнёрша. Со старым
    // фильтром судья противоположной роли не попадал в колонки вообще: ни
    // счётчик "сдал/нужно" в мониторе, ни сама оценка ("Взаимодействие" от
    // судьи-партнёрши) нигде не отображались, хотя в БД записывались. Берём
    // любого судью, у которого есть хоть один применимый к ЭТОЙ роли критерий
    // (для NORMAL и т.п. allowedJudgeRole всегда возвращает participantRole —
    // выражение ниже вырождается в прежнее "a.role === role", без изменений).
    const roleAssignments = assignments.filter((a) => criteria.some((c) => allowedJudgeRole(c.id, role, format, config) === a.role));
    const roleParticipants = [...participants.filter((p) => p.role === role)].sort(
      (a, b) => Number(a.registration.checkIn?.bibNumber ?? 0) - Number(b.registration.checkIn?.bibNumber ?? 0)
    );
    const judges = roleAssignments.map((a) => ({
      judgeAssignmentId: a.id,
      ...judgeDisplayName(a.judge),
      criteriaIds: criteria.filter((c) => allowedJudgeRole(c.id, role, format, config) === a.role).map((c) => c.id),
    }));

    const rows = roleParticipants.map((p) => {
      const scores: Record<string, Record<string, number | null>> = {};
      for (const a of roleAssignments) {
        const perCriterion: Record<string, number | null> = {};
        for (const c of criteria) {
          const applicable = allowedJudgeRole(c.id, p.role, format, config) === a.role;
          perCriterion[c.id] = applicable
            ? (p.finalJudgeScores.find((s) => s.criterionId === c.id && s.judgeAssignmentId === a.id)?.value ?? null)
            : null;
        }
        scores[a.id] = perCriterion;
      }
      return { drawParticipantId: p.id, bibNumber: p.registration.checkIn?.bibNumber ?? null, scores };
    });

    // JUDGES_DANCE — участники этой роли (танцующие в этом заходе) все из
    // одного захода (у каждой стадии свой единственный заход), поэтому
    // "подтверждён" здесь = у судьи есть JudgeHeatConfirmation по ВСЕМ
    // заходам, где реально танцуют участники этой роли (обычно один заход;
    // общий вид на случай, если участников роли когда-нибудь раскинут по
    // нескольким заходам).
    const roleHeatIds = [...new Set(roleParticipants.map((p) => p.heatId))];

    const totals: ScoreMonitorTotal[] = roleAssignments.map((a) => {
      let required = 0;
      let submitted = 0;
      for (const p of roleParticipants) {
        for (const c of criteria) {
          if (allowedJudgeRole(c.id, p.role, format, config) !== a.role) continue;
          required += 1;
          if (p.finalJudgeScores.some((s) => s.criterionId === c.id && s.judgeAssignmentId === a.id)) submitted += 1;
        }
      }
      const confirmed =
        format === "JUDGES_DANCE"
          ? roleHeatIds.length > 0 && roleHeatIds.every((hid) => confirmedHeatPairs.has(`${hid}:${a.id}`))
          : confirmedAssignmentIds.has(a.id);
      return { judgeAssignmentId: a.id, required, submitted, complete: submitted >= required, confirmed };
    });

    return { criteria: criteria.map((c) => ({ id: c.id, name: c.name })), judges, rows, totals };
  }

  return { format, leader: buildTable("LEADER"), follower: buildTable("FOLLOWER") };
}

// ---------------------------------------------------------------------------
// Полный пересинк (для ресинка после (пере)подключения к Supabase Realtime)
// ---------------------------------------------------------------------------

// Браузер подписывается на Supabase Realtime напрямую (ScoreMonitorTable.tsx)
// и сам переподключается при обрыве — но у Realtime-подписки нет буфера
// "додай то, что пропустил во время разрыва". Эта функция даёт клиенту
// полный снимок заново при каждом (пере)подключении канала — пересинк дороже
// точечного апдейта, но гарантирует, что таблица не "зависает" молча
// устаревшей после обрыва, а сама себя чинит.
export type ScoreMonitorSnapshot =
  | { kind: "prelim"; roundStatus: RoundStatus; maxValue: number; finalistsCount: number; leader: PrelimScoreMonitorTable; follower: PrelimScoreMonitorTable }
  | { kind: "final"; roundStatus: RoundStatus; format: FinalFormat; leader: FinalScoreMonitorTable; follower: FinalScoreMonitorTable }
  | { kind: "none"; roundStatus: RoundStatus | null };

// roundStatus в снимке (2026-09-10, по прямому запросу пользователя —
// "пусть когда все судьи нажмут готово, обновится монитор") — сам по себе
// живой канал оценок (use-score-events.ts) уже открыт на этом экране ради
// "✓ Готово" по каждому судье; JudgesLivePanel сравнивает это поле с
// серверным пропом roundStatus и сам просит router.refresh(), когда раунд
// реально сдвинулся (RUNNING -> SCORING -> COMPLETED и т.п.) — без отдельного
// канала на таблицу Round (RLS/realtime для неё нет и не нужен, у этого
// раунда уже есть токен на score-monitor:{roundId}).
export async function getScoreMonitorSnapshot(roundId: string): Promise<ScoreMonitorSnapshot> {
  const round = await prisma.round.findUniqueOrThrow({ where: { id: roundId }, select: { status: true, finalSession: { select: { id: true } } } });
  if (round.finalSession) {
    const final = await getFinalScoreMonitor(roundId);
    return final ? { kind: "final", roundStatus: round.status, format: final.format, leader: final.leader, follower: final.follower } : { kind: "none", roundStatus: round.status };
  }
  const prelim = await getPrelimScoreMonitor(roundId);
  return {
    kind: "prelim",
    roundStatus: round.status,
    maxValue: prelim.maxValue,
    finalistsCount: prelim.finalistsCount,
    leader: prelim.leader,
    follower: prelim.follower,
  };
}
