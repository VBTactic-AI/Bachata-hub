import { randomUUID } from "crypto";
import { Prisma, type Gender, type RegistrationRole, type RegistrationRoleOverrideStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { getActor, type Actor } from "../rbac/actor";
import { requirePermission } from "../rbac/authorize";
import { writeAudit } from "../audit/audit";
import { AlreadyRegisteredError, AuthenticationRequiredError, RegistrationNotOpenError, ValidationFailedError } from "../errors";
import type { RegisterByAdminInput, RegisterSelfInput } from "./registration-schemas";

type PrismaTx = Prisma.TransactionClient;

// Пол используется ТОЛЬКО как подсказка по умолчанию, не как правило
// (CLAUDE.md §4, §60; см. docs/00_DECISIONS.md). null — пол не указан в
// профиле, сравнивать не с чем, противоречия нет.
export function suggestedRoleForGender(gender: Gender | null): RegistrationRole | null {
  if (gender === "MALE") return "LEADER";
  if (gender === "FEMALE") return "FOLLOWER";
  return null;
}

// Competitor как отдельная сущность не заводится — аккаунт обязателен для
// участия (решение пользователя), регистрация ссылается на layer-1 Dancer
// напрямую (docs/00_DECISIONS.md).
//
// Проверка "регистрация открыта" выполняется ЗДЕСЬ, внутри транзакции, а не
// отдельным запросом до неё — иначе между проверкой и записью статус
// соревнования мог бы успеть смениться (напр. организатор закрыл
// регистрацию за секунду до того, как участник отправил форму).
async function insertRegistration(
  tx: PrismaTx,
  params: {
    competitionId: string;
    divisionId: string;
    dancerId: string;
    userId: string;
    gender: Gender | null;
    role: RegistrationRole;
    actor: Actor;
  }
) {
  const division = await tx.division.findFirst({
    where: { id: params.divisionId, competitionId: params.competitionId },
    include: { competition: { select: { status: true } } },
  });
  if (!division) throw new ValidationFailedError("Дивизион не найден в этом соревновании.");
  if (division.competition.status !== "REGISTRATION_OPEN") throw new RegistrationNotOpenError();

  // Если выбранная роль расходится с подсказкой по полу — сохраняем
  // БЕЗОПАСНОЕ значение (подсказку) как действующую роль и откладываем
  // запрошенную роль до подтверждения EVENT_ADMIN/HEAD_JUDGE. Так система
  // никогда не остаётся с ролью, которую фактически ещё никто не одобрил.
  const suggested = suggestedRoleForGender(params.gender);
  const mismatch = suggested !== null && suggested !== params.role;
  const effectiveRole = mismatch ? suggested! : params.role;
  const requestedRole = mismatch ? params.role : null;
  const roleOverrideStatus: RegistrationRoleOverrideStatus | null = mismatch ? "PENDING" : null;

  let created;
  try {
    created = await tx.registration.create({
      data: {
        competitionId: params.competitionId,
        divisionId: params.divisionId,
        dancerId: params.dancerId,
        role: effectiveRole,
        requestedRole,
        roleOverrideStatus,
        registeredById: params.actor.userId,
      },
    });
  } catch (e) {
    // Уникальный индекс (competitionId, divisionId, dancerId) — одна роль на
    // дивизион на человека (docs/00_DECISIONS.md, B6).
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new AlreadyRegisteredError();
    }
    throw e;
  }

  // Регистрация даёт роль COMPETITOR именно в этом соревновании (даёт право
  // registration:update_own/checkin:self через CompetitionMember) — по
  // аналогии с тем, как создатель соревнования автоматически получает
  // EVENT_ADMIN (see create-competition.ts).
  const competitorRole = await tx.role.findUniqueOrThrow({ where: { code: "COMPETITOR" } });
  await tx.competitionMember.upsert({
    where: {
      competitionId_userId_roleId: {
        competitionId: params.competitionId,
        userId: params.userId,
        roleId: competitorRole.id,
      },
    },
    update: {},
    create: {
      competitionId: params.competitionId,
      userId: params.userId,
      roleId: competitorRole.id,
      addedById: params.actor.userId,
    },
  });

  await writeAudit(tx, {
    actor: params.actor,
    action: "registration.create",
    entityType: "Registration",
    entityId: created.id,
    after: {
      competitionId: params.competitionId,
      divisionId: params.divisionId,
      dancerId: params.dancerId,
      role: effectiveRole,
      requestedRole,
      roleOverrideStatus,
    },
  });

  return created;
}

// Любой авторизованный пользователь может зарегистрироваться сам — включая
// SCHOOL_REP/ORGANIZER/MODERATOR/ADMIN сайта, у которых нет профиля танцора
// (он создаётся здесь, если отсутствует, точно как в registerByAdmin) —
// участие в конкурсе не обязано зависеть от роли на сайте.
export async function registerSelf(competitionId: string, input: RegisterSelfInput) {
  const actor = await getActor();
  if (!actor) throw new AuthenticationRequiredError();

  return prisma.$transaction(async (tx) => {
    let dancer = await tx.dancer.findUnique({ where: { userId: actor.userId } });
    if (!dancer) {
      dancer = await tx.dancer.create({ data: { userId: actor.userId, displayName: actor.email.split("@")[0] } });
    }

    return insertRegistration(tx, {
      competitionId,
      divisionId: input.divisionId,
      dancerId: dancer.id,
      userId: actor.userId,
      gender: dancer.gender,
      role: input.role,
      actor,
    });
  });
}

// registration:manage — EVENT_ADMIN (03 §4). Если аккаунта с таким email ещё
// нет — создаётся новый (роль DANCER) со случайным паролем; участник сможет
// восстановить доступ через сброс пароля. Если аккаунт есть, но без профиля
// танцора (напр. SCHOOL_REP) — профиль дозаводится тут же.
export async function registerByAdmin(competitionId: string, input: RegisterByAdminInput) {
  const actor = await requirePermission("registration:manage", competitionId);
  const email = input.email.trim().toLowerCase();

  return prisma.$transaction(async (tx) => {
    let user = await tx.user.findUnique({ where: { email }, include: { dancer: true } });

    if (!user) {
      const passwordHash = await hashPassword(randomUUID());
      user = await tx.user.create({
        data: {
          email,
          passwordHash,
          role: "DANCER",
          dancer: { create: { displayName: input.displayName || email.split("@")[0] } },
        },
        include: { dancer: true },
      });
    } else if (!user.dancer) {
      const createdDancer = await tx.dancer.create({
        data: { userId: user.id, displayName: input.displayName || email.split("@")[0] },
      });
      user = { ...user, dancer: createdDancer };
    }

    return insertRegistration(tx, {
      competitionId,
      divisionId: input.divisionId,
      dancerId: user.dancer!.id,
      userId: user.id,
      gender: user.dancer!.gender,
      role: input.role,
      actor,
    });
  });
}
