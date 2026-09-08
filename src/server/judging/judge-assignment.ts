import { cache } from "react";
import type { Prisma, RegistrationRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "../rbac/authorize";
import { writeAudit } from "../audit/audit";
import { ValidationFailedError } from "../errors";
import { maybeFinalizeAfterScoreInTx } from "./advancement";
import { suggestedRoleForGender } from "../competition/register-competitor";

// Роль судьи определяется его полом автоматически ("мужской судит
// партнёров, женский — партнёрш") — по прямому запросу пользователя,
// 2026-09-09, разворот прежней формулировки A6/A13 ("пол — только
// подсказка, роль выбирает организатор вручную"). Один судья — всегда одна
// роль (нельзя вручную назначить и вторую, даже при нехватке судей —
// пользователь подтвердил это ограничение осознанно). Ручной выбор роли
// остаётся ЕДИНСТВЕННЫМ запасным путём — когда у судьи вообще нет данных о
// поле (нет профиля танцора или пол не указан, поле необязательное),
// автоопределение невозможно.
//
// Переиспользует suggestedRoleForGender (та же логика уже применяется как
// подсказка роли участника при регистрации, D8) — то же соответствие
// пол→роль, специально не дублируем отдельной функцией.

// Судья закреплён на дивизион и РОЛЬ (LEADER/FOLLOWER) — не на пол участника,
// но САМА роль вычисляется из пола судьи (см. выше). judgeUserId — реальный
// id пользователя (найден через поиск по имени на клиенте), не email: после
// redesign 2026-09-09 email нигде в интерфейсе судейства не показывается и
// не запрашивается.
export async function assignJudge(
  divisionId: string,
  judgeUserId: string,
  manualRole?: RegistrationRole
): Promise<{ id: string }> {
  const division = await prisma.division.findUniqueOrThrow({
    where: { id: divisionId },
    select: { competitionId: true },
  });
  const actor = await requirePermission("judge:assign", division.competitionId);

  const judge = await prisma.user.findUnique({ where: { id: judgeUserId }, include: { dancer: { select: { gender: true } } } });
  if (!judge) {
    throw new ValidationFailedError("Судья не найден.");
  }

  // Пол известен — роль всегда из него, ручной manualRole в этом случае
  // игнорируется (не даём переопределить, это осознанное решение
  // пользователя). Пол неизвестен — используем то, что явно прислал клиент
  // (форма показывает выбор роли только в этом случае), а если и этого нет —
  // понятная ошибка вместо тихого падения в NULL.
  const genderRole = suggestedRoleForGender(judge.dancer?.gender ?? null);
  const role = genderRole ?? manualRole;
  if (!role) {
    throw new ValidationFailedError("Не удалось определить роль автоматически — у судьи не указан пол в профиле. Укажите роль вручную.");
  }

  const existing = await prisma.judgeAssignment.findUnique({
    where: { divisionId_judgeUserId_role: { divisionId, judgeUserId, role } },
  });
  if (existing) {
    throw new ValidationFailedError("Этот судья уже назначен на эту роль в этой категории.");
  }

  return prisma.$transaction(async (tx) => {
    const assignment = await tx.judgeAssignment.create({
      data: { divisionId, judgeUserId, role, assignedById: actor.userId },
    });
    await grantJudgeCompetitionMembership(tx, division.competitionId, judgeUserId, actor.userId);
    await writeAudit(tx, {
      actor,
      action: "judge.assign",
      entityType: "JudgeAssignment",
      entityId: assignment.id,
      after: { divisionId, judgeUserId, judgeEmail: judge.email, role },
    });
    return { id: assignment.id };
  });
}

// Добавление человека в общий ростер судей СОРЕВНОВАНИЯ (CompetitionMember,
// роль JUDGE) — без привязки к конкретной категории (по прямому запросу
// пользователя, 2026-09-09: "Общий список судей" наверху вкладки "Судьи"
// пополняется отдельно от "присвоения к категориям" ниже, которое лишь
// выбирает уже добавленных сюда людей). Идемпотентно — тот же upsert, что
// grantJudgeCompetitionMembership уже делает как побочный эффект assignJudge;
// вызов дважды для одного и того же человека не создаёт дубликат и не ошибка.
export async function addCompetitionJudge(competitionId: string, judgeUserId: string): Promise<{ id: string }> {
  const actor = await requirePermission("judge:assign", competitionId);

  const judge = await prisma.user.findUnique({ where: { id: judgeUserId } });
  if (!judge) {
    throw new ValidationFailedError("Судья не найден.");
  }

  return prisma.$transaction(async (tx) => {
    const member = await grantJudgeCompetitionMembership(tx, competitionId, judgeUserId, actor.userId);
    await writeAudit(tx, {
      actor,
      action: "competition_member.add_judge",
      entityType: "CompetitionMember",
      entityId: member.id,
      after: { competitionId, judgeUserId, judgeEmail: judge.email },
    });
    return { id: member.id };
  });
}

// Удаление судьи из общего ростера соревнования (кнопка-корзина в "Общий
// список судей", 2026-09-09) — снимает ВСЕ его назначения по всем категориям
// этого соревнования разом, а не только сам CompetitionMember (иначе он
// остался бы висеть в JudgeAssignment без права судить вообще, CLAUDE.md
// §60 "не оставляй противоречивое состояние молча"). Тот же JUDGE-001-guard,
// что и в setDivisionJudges — если судья уже что-то оценил хотя бы в одной
// категории, удаление отклоняется целиком, историю нельзя стереть молча.
export async function removeCompetitionJudge(competitionId: string, judgeUserId: string): Promise<void> {
  const actor = await requirePermission("judge:assign", competitionId);

  const assignments = await prisma.judgeAssignment.findMany({
    where: { judgeUserId, division: { competitionId } },
    select: { id: true, divisionId: true },
  });
  const assignmentIds = assignments.map((a) => a.id);

  if (assignmentIds.length > 0) {
    const [scored, finalScored, confirmed] = await Promise.all([
      prisma.judgeScore.findFirst({ where: { judgeAssignmentId: { in: assignmentIds } } }),
      prisma.finalJudgeScore.findFirst({ where: { judgeAssignmentId: { in: assignmentIds } } }),
      prisma.judgeRoundConfirmation.findFirst({ where: { judgeAssignmentId: { in: assignmentIds } } }),
    ]);
    if (scored || finalScored || confirmed) {
      throw new ValidationFailedError("Нельзя убрать судью — он уже выставлял оценки в одной из категорий этого соревнования.");
    }
  }

  const judgeRole = await prisma.role.findUniqueOrThrow({ where: { code: "JUDGE" } });
  const member = await prisma.competitionMember.findUnique({
    where: { competitionId_userId_roleId: { competitionId, userId: judgeUserId, roleId: judgeRole.id } },
  });
  if (!member) {
    throw new ValidationFailedError("Судья не найден в этом соревновании.");
  }

  const affectedDivisionIds = [...new Set(assignments.map((a) => a.divisionId))];

  await prisma.$transaction(async (tx) => {
    if (assignmentIds.length > 0) {
      await tx.judgeAssignment.deleteMany({ where: { id: { in: assignmentIds } } });
    }
    await tx.competitionMember.delete({ where: { id: member.id } });
    await writeAudit(tx, {
      actor,
      action: "competition_member.remove_judge",
      entityType: "CompetitionMember",
      entityId: member.id,
      before: { competitionId, judgeUserId, removedFromDivisionIds: affectedDivisionIds },
    });

    // Как и в setDivisionJudges — снятие судьи меняет знаменатель готовности
    // идущих раундов ("собрано X из N назначенных"), перепроверяем каждую
    // затронутую категорию.
    for (const divisionId of affectedDivisionIds) {
      const roundsInProgress = await tx.round.findMany({
        where: { divisionId, type: null, status: { in: ["RUNNING", "FINISHED", "SCORING"] } },
        select: { id: true },
      });
      for (const r of roundsInProgress) {
        await maybeFinalizeAfterScoreInTx(tx, r.id, actor);
      }
    }
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
): Promise<{ id: string }> {
  const judgeRole = await tx.role.findUniqueOrThrow({ where: { code: "JUDGE" } });
  return tx.competitionMember.upsert({
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

// Назначения ТЕКУЩЕГО судьи в этом соревновании. Нужны и судейской очереди
// обычных раундов (getJudgeQueue), и списку активных финалов
// (listMyActiveFinalRounds) — на загрузке /judging/[competitionId] это был
// один и тот же SELECT дважды за запрос (замерено, 2026-09-08).
// cache() дедуплицирует его в пределах одного HTTP-запроса — как это уже
// сделано для getActor()/getCurrentUser()/getMyDancerRef().
//
// Прав здесь не проверяем: вызывающие сервисы уже сделали
// requirePermission("score:submit", competitionId) до обращения сюда, и сам
// запрос отфильтрован по judgeUserId переданного actor'а.
export const getMyJudgeAssignments = cache(async (judgeUserId: string, competitionId: string) =>
  prisma.judgeAssignment.findMany({ where: { judgeUserId, division: { competitionId } } })
);

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

  // Роль вычисляется из пола (см. assignJudge) — этот путь batch-добавления
  // (чекбоксы в DivisionJudgesPanel) собирает роль на клиенте ДО отправки, но
  // критическая логика не может быть только на frontend (CLAUDE.md §1/§8-9):
  // перепроверяем здесь, что для каждого добавляемого судьи с известным полом
  // выбранная роль ему соответствует. Ручной выбор остаётся возможен только
  // когда пол не указан (suggestedRoleForGender вернёт null).
  if (toAdd.length > 0) {
    const addedUsers = await prisma.user.findMany({
      where: { id: { in: toAdd.map((d) => d.judgeUserId) } },
      select: { id: true, email: true, dancer: { select: { gender: true } } },
    });
    const usersById = new Map(addedUsers.map((u) => [u.id, u]));
    for (const d of toAdd) {
      const user = usersById.get(d.judgeUserId);
      const genderRole = suggestedRoleForGender(user?.dancer?.gender ?? null);
      if (genderRole && genderRole !== d.role) {
        throw new ValidationFailedError(
          `Судья ${user?.email ?? d.judgeUserId} по полу судит другую роль — проверьте выбор в форме добавления.`
        );
      }
    }
  }

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
        `Нельзя убрать судью — уже есть оценки в этой категории: ${blockedJudges.map((j) => j.email).join(", ")}. Снимите галочку только с тех, кто ещё не судил.`
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

    // Снятие судьи меняет ЗНАМЕНАТЕЛЬ готовности раунда: "собрано X из N"
    // считает N по числу назначенных судей, поэтому убранный судья может
    // сделать уже идущий раунд полностью готовым к подсчёту. Раньше это
    // нигде не перепроверялось — раунд оставался в SCORING навсегда и
    // блокировал следующий раунд дивизиона (реальный случай на конкурсе
    // 2026-09-08: судья нажал "Готово", после чего организатор снял двух
    // лишних судей — раунд повис при 100% собранных оценок).
    //
    // Добавление судьи специально не обрабатываем: оно только увеличивает N,
    // раунд от этого готовым стать не может — он просто ждёт нового судью.
    if (toRemove.length > 0) {
      const roundsInProgress = await tx.round.findMany({
        where: { divisionId, type: null, status: { in: ["RUNNING", "FINISHED", "SCORING"] } },
        select: { id: true },
      });
      for (const r of roundsInProgress) {
        await maybeFinalizeAfterScoreInTx(tx, r.id, actor);
      }
    }
  });
}

