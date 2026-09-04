import type { RegistrationRole } from "@prisma/client";
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

export async function removeJudgeAssignment(assignmentId: string): Promise<void> {
  const assignment = await prisma.judgeAssignment.findUniqueOrThrow({
    where: { id: assignmentId },
    include: { division: { select: { competitionId: true } } },
  });
  const actor = await requirePermission("judge:assign", assignment.division.competitionId);

  await prisma.$transaction(async (tx) => {
    await tx.judgeAssignment.delete({ where: { id: assignmentId } });
    await writeAudit(tx, {
      actor,
      action: "judge.unassign",
      entityType: "JudgeAssignment",
      entityId: assignmentId,
      before: { divisionId: assignment.divisionId, judgeUserId: assignment.judgeUserId, role: assignment.role },
    });
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
