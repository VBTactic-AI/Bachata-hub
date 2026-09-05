import type { Prisma, RegistrationRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "../rbac/authorize";
import { writeAudit } from "../audit/audit";
import { ValidationFailedError } from "../errors";

// Судья закреплён на дивизион и РОЛЬ (LEADER/FOLLOWER) — не на пол участника.
// Пол судьи по умолчанию совпадает с ролью, которую он судит, но это только
// подсказка при назначении (кто именно смотрит на ведущих/ведомых решает
// EVENT_ADMIN/HEAD_JUDGE вручную) — уточняет прежнюю формулировку A6
// (docs/00_DECISIONS.md, 2026-09-04).
export async function assignJudge(
  divisionId: string,
  judgeEmail: string,
  role: RegistrationRole
): Promise<{ id: string }> {
  const division = await prisma.division.findUniqueOrThrow({
    where: { id: divisionId },
    select: { competitionId: true },
  });
  const actor = await requirePermission("judge:assign", division.competitionId);

  const judge = await prisma.user.findUnique({ where: { email: judgeEmail.trim().toLowerCase() } });
  if (!judge) {
    throw new ValidationFailedError("Пользователь с таким email не найден — судья должен сначала завести аккаунт на сайте.");
  }

  const existing = await prisma.judgeAssignment.findUnique({
    where: { divisionId_judgeUserId_role: { divisionId, judgeUserId: judge.id, role } },
  });
  if (existing) {
    throw new ValidationFailedError("Этот судья уже назначен на эту роль в этом дивизионе.");
  }

  return prisma.$transaction(async (tx) => {
    const assignment = await tx.judgeAssignment.create({
      data: { divisionId, judgeUserId: judge.id, role, assignedById: actor.userId },
    });
    await grantJudgeCompetitionMembership(tx, division.competitionId, judge.id, actor.userId);
    await writeAudit(tx, {
      actor,
      action: "judge.assign",
      entityType: "JudgeAssignment",
      entityId: assignment.id,
      after: { divisionId, judgeUserId: judge.id, judgeEmail: judge.email, role },
    });
    return { id: assignment.id };
  });
}

// JudgeAssignment сама по себе не даёт права судить (score:submit) — это
// закреплённость за дивизионом/ролью, а не запись в RBAC. Право приходит
// только через CompetitionMember с ролью JUDGE, ровно как создатель
// соревнования автоматически получает EVENT_ADMIN (create-competition.ts), а
// самостоятельно зарегистрировавшийся участник — COMPETITOR
// (register-competitor.ts). Раньше этого шага здесь не было — судья успешно
// назначался в админке, но при заходе на /judging/[competitionId] падал с
// NotCompetitionMemberError, потому что состоял в JudgeAssignment, но не был
// членом соревнования (найдено на живом тестировании, 2026-09-05). Не
// снимаем это членство при unassignJudge/setDivisionJudges — судья мог быть
// назначен ещё на другой дивизион этого же соревнования, а лишняя запись
// CompetitionMember сама по себе прав сверх уже проверяемых не даёт.
async function grantJudgeCompetitionMembership(
  tx: Prisma.TransactionClient,
  competitionId: string,
  judgeUserId: string,
  addedById: string
): Promise<void> {
  const judgeRole = await tx.role.findUniqueOrThrow({ where: { code: "JUDGE" } });
  await tx.competitionMember.upsert({
    where: { competitionId_userId_roleId: { competitionId, userId: judgeUserId, roleId: judgeRole.id } },
    update: {},
    create: { competitionId, userId: judgeUserId, roleId: judgeRole.id, addedById },
  });
}

export type DivisionJudge = {
  id: string;
  role: RegistrationRole;
  judgeUserId: string;
  judgeEmail: string;
};

export async function listDivisionJudges(divisionId: string): Promise<DivisionJudge[]> {
  const division = await prisma.division.findUniqueOrThrow({ where: { id: divisionId }, select: { competitionId: true } });
  await requirePermission("judge:assign", division.competitionId);

  const rows = await prisma.judgeAssignment.findMany({
    where: { divisionId },
    include: { judge: { select: { email: true } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({ id: r.id, role: r.role, judgeUserId: r.judgeUserId, judgeEmail: r.judge.email }));
}

// Устанавливает СЕТКУ судей дивизиона одним "Сохранить" (две таблички —
// ведущих/ведомых судят галочками из общего пула судей соревнования, по
// запросу пользователя, 2026-09-04) — реконсиляция диффом (создать
// недостающих, убрать снятых), а не добавление по одному. `judgeUserId` в
// обоих списках — из пула судей ЭТОГО соревнования (см. listCompetitionJudgePool);
// новый (ещё не судивший это соревнование) человек добавляется отдельным
// действием (assignJudge) — здесь только переключение уже известных.
export async function setDivisionJudges(
  divisionId: string,
  leaderJudgeUserIds: string[],
  followerJudgeUserIds: string[]
): Promise<void> {
  const division = await prisma.division.findUniqueOrThrow({ where: { id: divisionId }, select: { competitionId: true } });
  const actor = await requirePermission("judge:assign", division.competitionId);

  const desired: { role: RegistrationRole; judgeUserId: string }[] = [
    ...[...new Set(leaderJudgeUserIds)].map((judgeUserId) => ({ role: "LEADER" as const, judgeUserId })),
    ...[...new Set(followerJudgeUserIds)].map((judgeUserId) => ({ role: "FOLLOWER" as const, judgeUserId })),
  ];

  const existing = await prisma.judgeAssignment.findMany({ where: { divisionId } });
  const desiredKeys = new Set(desired.map((d) => `${d.role}:${d.judgeUserId}`));
  const existingKeys = new Set(existing.map((e) => `${e.role}:${e.judgeUserId}`));

  const toRemove = existing.filter((e) => !desiredKeys.has(`${e.role}:${e.judgeUserId}`));
  const toAdd = desired.filter((d) => !existingKeys.has(`${d.role}:${d.judgeUserId}`));
  if (toRemove.length === 0 && toAdd.length === 0) return;

  // JUDGE-001: JudgeScore/FinalJudgeScore/JudgeRoundConfirmation ссылаются на
  // JudgeAssignment с ON DELETE RESTRICT — попытка удалить назначение, по
  // которому судья уже что-то оценил, раньше падала необработанной ошибкой
  // БД (P2003) и превращалась в общий "Внутренняя ошибка сервера" (CLAUDE.md
  // §46), да ещё и откатывала весь batched diff разом, без объяснения, из-за
  // какого именно судьи. Проверяем заранее и называем конкретных людей.
  if (toRemove.length > 0) {
    const removeIds = toRemove.map((e) => e.id);
    const [scored, finalScored, confirmed] = await Promise.all([
      prisma.judgeScore.findMany({ where: { judgeAssignmentId: { in: removeIds } }, select: { judgeAssignmentId: true }, distinct: ["judgeAssignmentId"] }),
      prisma.finalJudgeScore.findMany({ where: { judgeAssignmentId: { in: removeIds } }, select: { judgeAssignmentId: true }, distinct: ["judgeAssignmentId"] }),
      prisma.judgeRoundConfirmation.findMany({ where: { judgeAssignmentId: { in: removeIds } }, select: { judgeAssignmentId: true }, distinct: ["judgeAssignmentId"] }),
    ]);
    const blockedAssignmentIds = new Set([...scored, ...finalScored, ...confirmed].map((r) => r.judgeAssignmentId));
    if (blockedAssignmentIds.size > 0) {
      const blockedUserIds = toRemove.filter((e) => blockedAssignmentIds.has(e.id)).map((e) => e.judgeUserId);
      const blockedJudges = await prisma.user.findMany({ where: { id: { in: blockedUserIds } }, select: { email: true } });
      throw new ValidationFailedError(
        `Нельзя убрать судью — уже есть оценки в этом дивизионе: ${blockedJudges.map((j) => j.email).join(", ")}. Снимите галочку только с тех, кто ещё не судил.`
      );
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const e of toRemove) {
      await tx.judgeAssignment.delete({ where: { id: e.id } });
      await writeAudit(tx, {
        actor,
        action: "judge.unassign",
        entityType: "JudgeAssignment",
        entityId: e.id,
        before: { divisionId, judgeUserId: e.judgeUserId, role: e.role },
      });
    }
    for (const d of toAdd) {
      const created = await tx.judgeAssignment.create({
        data: { divisionId, judgeUserId: d.judgeUserId, role: d.role, assignedById: actor.userId },
      });
      await grantJudgeCompetitionMembership(tx, division.competitionId, d.judgeUserId, actor.userId);
      await writeAudit(tx, {
        actor,
        action: "judge.assign",
        entityType: "JudgeAssignment",
        entityId: created.id,
        after: { divisionId, judgeUserId: d.judgeUserId, role: d.role },
      });
    }
  });
}

