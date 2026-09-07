import type { FinalFormat, RegistrationRole } from "@prisma/client";
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

export type ScoreMonitorTotal = { judgeAssignmentId: string; required: number; submitted: number; complete: boolean };

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
};

export type PrelimScoreMonitor = { maxValue: number; leader: PrelimScoreMonitorTable; follower: PrelimScoreMonitorTable };

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

    const totals: ScoreMonitorTotal[] = roleAssignments.map((a) => {
      if (skippedRoles.has(role)) return { judgeAssignmentId: a.id, required: 0, submitted: 0, complete: true };
      if (isConfirmationBased) {
        const submitted = confirmedAssignmentIds.has(a.id) ? 1 : 0;
        return { judgeAssignmentId: a.id, required: 1, submitted, complete: submitted === 1 };
      }
      const required = roleParticipants.length;
      const submitted = roleParticipants.filter((p) => p.judgeScores.some((s) => s.judgeAssignmentId === a.id)).length;
      return { judgeAssignmentId: a.id, required, submitted, complete: submitted >= required };
    });

    return { judges, rows, totals };
  }

  return { maxValue: round.judgingMaxScore, leader: buildTable("LEADER"), follower: buildTable("FOLLOWER") };
}

// ---------------------------------------------------------------------------
// Финалы (FinalJudgeScore, критерии вместо единой шкалы)
// ---------------------------------------------------------------------------

type CriterionSnapshot = { id: string; name: string; priority: number; minScore: number; maxScore: number; step: number };

export type FinalScoreMonitorTable = {
  criteria: { id: string; name: string }[];
  judges: ScoreMonitorJudgeColumn[];
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
  const participants = heats.flatMap((h) => h.draws[0]?.participants ?? []);

  const assignments = await prisma.judgeAssignment.findMany({
    where: { divisionId: round.divisionId },
    select: { id: true, role: true, judge: { select: JUDGE_SELECT } },
    orderBy: { createdAt: "asc" },
  });

  function buildTable(role: RegistrationRole): FinalScoreMonitorTable {
    const roleAssignments = assignments.filter((a) => a.role === role);
    const roleParticipants = [...participants.filter((p) => p.role === role)].sort(
      (a, b) => Number(a.registration.checkIn?.bibNumber ?? 0) - Number(b.registration.checkIn?.bibNumber ?? 0)
    );
    const judges = roleAssignments.map((a) => ({ judgeAssignmentId: a.id, ...judgeDisplayName(a.judge) }));

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
      return { judgeAssignmentId: a.id, required, submitted, complete: submitted >= required };
    });

    return { criteria: criteria.map((c) => ({ id: c.id, name: c.name })), judges, rows, totals };
  }

  return { format, leader: buildTable("LEADER"), follower: buildTable("FOLLOWER") };
}
