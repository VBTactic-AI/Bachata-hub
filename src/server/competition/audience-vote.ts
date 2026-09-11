import type { AudienceVoteRole, AudienceVoteStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getActor, type Actor } from "../rbac/actor";
import { can, requirePermission } from "../rbac/authorize";
import { transition, type TransitionTable } from "../state/machine";
import { writeAudit } from "../audit/audit";
import { AuthenticationRequiredError, ValidationFailedError } from "../errors";
import type {
  CastAudienceVoteBallotInput,
  ConfigureAudienceVoteInput,
  ConfirmAudienceVoteWinnersInput,
  StartAudienceVoteInput,
} from "./schemas";

type PrismaTx = Prisma.TransactionClient;

// Приз зрительских симпатий (Audience Vote) — отдельная от судейского
// движка подсистема голосования, одна на Division (docs/00_DECISIONS.md,
// план "Приз зрительских симпатий", согласован с пользователем 2026-09-11).
//
// Жизненный цикл ЛИНЕЙНЫЙ, без повторного открытия: IDLE -> RUNNING ->
// CLOSED -> PUBLISHED, PUBLISHED -> CLOSED только через unpublish с
// причиной. Настройки (mode/displayMode/infoText) редактируются только в
// IDLE — после старта фиксируются (тот же принцип, что CompetitionRules/
// FinalSettings, A1/A22 — снимок на момент старта, не переписывается задним
// числом). Официальный победитель — НЕ авто по числу голосов: организатор
// явно подтверждает (CLAUDE.md §19-20 "никогда не выбирай молча"), публикация
// требует хотя бы одного подтверждённого победителя.

const TABLE: TransitionTable<AudienceVoteStatus> = {
  IDLE: ["RUNNING"],
  RUNNING: ["CLOSED"],
  CLOSED: ["PUBLISHED"],
  PUBLISHED: ["CLOSED"],
};

async function loadDivisionForCompetition(divisionId: string) {
  return prisma.division.findUniqueOrThrow({
    where: { id: divisionId },
    select: { id: true, competitionId: true, category: { select: { name: true } } },
  });
}

// --- Настройка (только пока IDLE) ------------------------------------------

export async function configureAudienceVote(divisionId: string, input: ConfigureAudienceVoteInput): Promise<void> {
  const division = await loadDivisionForCompetition(divisionId);
  const actor = await requirePermission("audience_vote:manage", division.competitionId);

  const existing = await prisma.audienceVote.findUnique({ where: { divisionId } });
  if (existing && existing.status !== "IDLE") {
    throw new ValidationFailedError("Настройки голосования нельзя менять после старта — сначала остановите его.");
  }

  await prisma.$transaction(async (tx) => {
    const after = { mode: input.mode, displayMode: input.displayMode, infoText: input.infoText ?? null };
    if (existing) {
      await tx.audienceVote.update({ where: { divisionId }, data: after });
      await writeAudit(tx, {
        actor,
        action: "audience_vote.configure",
        entityType: "AudienceVote",
        entityId: existing.id,
        before: { mode: existing.mode, displayMode: existing.displayMode, infoText: existing.infoText },
        after,
      });
    } else {
      const created = await tx.audienceVote.create({ data: { divisionId, ...after } });
      await writeAudit(tx, { actor, action: "audience_vote.configure", entityType: "AudienceVote", entityId: created.id, after });
    }
  });
}

// --- Старт / стоп ------------------------------------------------------------

export async function startAudienceVote(divisionId: string, input: StartAudienceVoteInput): Promise<void> {
  const division = await loadDivisionForCompetition(divisionId);
  const actor = await requirePermission("audience_vote:manage", division.competitionId);

  const vote = await prisma.audienceVote.findUnique({ where: { divisionId } });
  if (!vote) {
    throw new ValidationFailedError("Сначала настройте голосование (режим, отображение) — потом можно запускать.");
  }

  const closesAt = input.durationMinutes ? new Date(Date.now() + input.durationMinutes * 60_000) : null;

  await transition({
    entityType: "AudienceVote",
    entityId: vote.id,
    table: TABLE,
    currentStatus: vote.status,
    statusVersion: vote.statusVersion,
    to: "RUNNING",
    actor,
    applyUpdate: async (tx, { to, expectedVersion }) => {
      const result = await tx.audienceVote.updateMany({
        where: { id: vote.id, statusVersion: expectedVersion },
        data: { status: to, statusVersion: { increment: 1 }, startedAt: new Date(), startedById: actor.userId, closesAt, closedAt: null, closedById: null },
      });
      return {
        before: { status: vote.status },
        after: { status: to, closesAt: closesAt?.toISOString() ?? null },
        updatedCount: result.count,
      };
    },
  });
}

export async function stopAudienceVote(divisionId: string): Promise<void> {
  const division = await loadDivisionForCompetition(divisionId);
  const actor = await requirePermission("audience_vote:manage", division.competitionId);

  const vote = await prisma.audienceVote.findUniqueOrThrow({ where: { divisionId } });

  await transition({
    entityType: "AudienceVote",
    entityId: vote.id,
    table: TABLE,
    currentStatus: vote.status,
    statusVersion: vote.statusVersion,
    to: "CLOSED",
    actor,
    applyUpdate: async (tx, { to, expectedVersion }) => {
      const result = await tx.audienceVote.updateMany({
        where: { id: vote.id, statusVersion: expectedVersion },
        data: { status: to, statusVersion: { increment: 1 }, closedAt: new Date(), closedById: actor.userId },
      });
      return { before: { status: vote.status }, after: { status: to }, updatedCount: result.count };
    },
  });
}

// Реактивная проверка истёкшего таймера (сервер — источник времени,
// CLAUDE.md §12) — по образцу autoAdvanceRoundIfAllHeatsFinishedInTx
// (round-state.ts): без cron/воркера, вызывается в начале каждого пути,
// который читает/пишет голосование. actor: null — системное действие, никто
// конкретно не нажимал "Стоп" (ровно тот случай, для которого AuditEntry.actor
// допускает null, см. её комментарий в audit.ts).
async function autoCloseIfExpired<T extends { id: string; status: AudienceVoteStatus; statusVersion: number; closesAt: Date | null }>(
  vote: T
): Promise<T> {
  if (vote.status !== "RUNNING" || !vote.closesAt || vote.closesAt.getTime() > Date.now()) return vote;

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.audienceVote.updateMany({
      where: { id: vote.id, statusVersion: vote.statusVersion },
      data: { status: "CLOSED", statusVersion: { increment: 1 }, closedAt: new Date() },
    });
    if (result.count === 0) return null; // кто-то уже закрыл параллельно (ручной "Стоп" опередил)
    await writeAudit(tx, {
      actor: null,
      action: "audience_vote.auto_close",
      entityType: "AudienceVote",
      entityId: vote.id,
      before: { status: "RUNNING" },
      after: { status: "CLOSED" },
      reason: "Истёк таймер голосования",
    });
    return tx.audienceVote.findUniqueOrThrow({ where: { id: vote.id } });
  });

  return updated ? ({ ...vote, ...updated } as T) : ({ ...vote, status: "CLOSED" as const });
}

// --- Голос зрителя -----------------------------------------------------------

export async function castAudienceVoteBallot(divisionId: string, input: CastAudienceVoteBallotInput): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new AuthenticationRequiredError();

  let vote = await prisma.audienceVote.findUnique({ where: { divisionId } });
  if (!vote) throw new ValidationFailedError("Голосование для этой категории ещё не настроено.");
  vote = await autoCloseIfExpired(vote);
  if (vote.status !== "RUNNING") {
    throw new ValidationFailedError("Голосование сейчас не идёт.");
  }

  if (vote.mode === "GENERAL" && input.role !== "ANY") {
    throw new ValidationFailedError("В этом режиме голосования роль не выбирается.");
  }
  if (vote.mode === "BY_ROLE" && input.role === "ANY") {
    throw new ValidationFailedError("В этом режиме нужно выбрать, за партнёра или партнёршу вы голосуете.");
  }

  const registration = await prisma.registration.findFirst({
    where: { id: input.registrationId, divisionId },
    select: { id: true, role: true, checkIn: { select: { id: true } } },
  });
  if (!registration) throw new ValidationFailedError("Участник не найден в этой категории.");
  if (!registration.checkIn) throw new ValidationFailedError("Голосовать можно только за участников, прошедших check-in.");
  if (vote.mode === "BY_ROLE" && registration.role !== input.role) {
    throw new ValidationFailedError("Этот участник — не той роли, за которую вы пытаетесь проголосовать.");
  }

  await prisma.audienceVoteBallot.upsert({
    where: { audienceVoteId_voterUserId_role: { audienceVoteId: vote.id, voterUserId: user.id, role: input.role } },
    create: { audienceVoteId: vote.id, voterUserId: user.id, role: input.role, registrationId: registration.id },
    update: { registrationId: registration.id },
  });
}

// --- Кандидаты / тираж (общая часть для admin и public view) -----------------

export type AudienceVoteCandidate = {
  registrationId: string;
  role: "LEADER" | "FOLLOWER";
  bibNumber: string | null;
  displayName: string;
};

async function loadCandidates(divisionId: string): Promise<AudienceVoteCandidate[]> {
  const registrations = await prisma.registration.findMany({
    where: { divisionId, checkIn: { isNot: null } },
    select: {
      id: true,
      role: true,
      checkIn: { select: { bibNumber: true } },
      dancer: { select: { displayName: true } },
    },
    orderBy: [{ checkIn: { bibNumber: "asc" } }],
  });
  return registrations.map((r) => ({
    registrationId: r.id,
    role: r.role,
    bibNumber: r.checkIn?.bibNumber ?? null,
    displayName: r.dancer.displayName,
  }));
}

async function tallyFor(audienceVoteId: string): Promise<Map<string, number>> {
  const grouped = await prisma.audienceVoteBallot.groupBy({
    by: ["registrationId"],
    where: { audienceVoteId },
    _count: { _all: true },
  });
  return new Map(grouped.map((g) => [g.registrationId, g._count._all]));
}

// --- Админ: live-результаты (всегда видны, независимо от статуса) -----------

export type AudienceVoteAdminView = {
  id: string;
  divisionId: string;
  categoryName: string;
  mode: "GENERAL" | "BY_ROLE";
  displayMode: "NUMBER_ONLY" | "NUMBER_AND_NAME";
  infoText: string | null;
  status: AudienceVoteStatus;
  startedAt: string | null;
  closesAt: string | null;
  closedAt: string | null;
  publishedAt: string | null;
  candidates: AudienceVoteCandidate[];
  tally: Record<string, number>;
  winners: { role: AudienceVoteRole; registrationId: string; voteCount: number }[];
} | null;

export async function getAudienceVoteAdminView(divisionId: string): Promise<AudienceVoteAdminView> {
  const division = await loadDivisionForCompetition(divisionId);
  await requirePermission("audience_vote:manage", division.competitionId);

  let vote = await prisma.audienceVote.findUnique({ where: { divisionId } });
  if (!vote) return null;
  vote = await autoCloseIfExpired(vote);

  const [candidates, tally, winners] = await Promise.all([
    loadCandidates(divisionId),
    tallyFor(vote.id),
    prisma.audienceVoteWinner.findMany({ where: { audienceVoteId: vote.id }, select: { role: true, registrationId: true, voteCount: true } }),
  ]);

  return {
    id: vote.id,
    divisionId,
    categoryName: division.category.name,
    mode: vote.mode,
    displayMode: vote.displayMode,
    infoText: vote.infoText,
    status: vote.status,
    startedAt: vote.startedAt?.toISOString() ?? null,
    closesAt: vote.closesAt?.toISOString() ?? null,
    closedAt: vote.closedAt?.toISOString() ?? null,
    publishedAt: vote.publishedAt?.toISOString() ?? null,
    candidates,
    tally: Object.fromEntries(tally),
    winners,
  };
}

// --- Подтверждение победителя (только из CLOSED) -----------------------------

export async function confirmAudienceVoteWinners(divisionId: string, input: ConfirmAudienceVoteWinnersInput): Promise<void> {
  const division = await loadDivisionForCompetition(divisionId);
  const actor = await requirePermission("audience_vote:manage", division.competitionId);

  const vote = await prisma.audienceVote.findUniqueOrThrow({ where: { divisionId } });
  if (vote.status !== "CLOSED") {
    throw new ValidationFailedError('Победителя можно подтвердить только после того, как голосование закрыто (статус "Закрыто").');
  }

  const validIds = new Set((await loadCandidates(divisionId)).map((c) => c.registrationId));
  for (const id of input.registrationIds) {
    if (!validIds.has(id)) throw new ValidationFailedError("В списке есть участник, которого нет в этой категории.");
  }

  const tally = await tallyFor(vote.id);

  await prisma.$transaction(async (tx) => {
    const before = await tx.audienceVoteWinner.findMany({ where: { audienceVoteId: vote.id, role: input.role } });
    await tx.audienceVoteWinner.deleteMany({ where: { audienceVoteId: vote.id, role: input.role } });
    if (input.registrationIds.length > 0) {
      await tx.audienceVoteWinner.createMany({
        data: input.registrationIds.map((registrationId) => ({
          audienceVoteId: vote.id,
          role: input.role,
          registrationId,
          voteCount: tally.get(registrationId) ?? 0,
          confirmedById: actor.userId,
        })),
      });
    }
    await writeAudit(tx, {
      actor,
      action: "audience_vote.confirm_winner",
      entityType: "AudienceVote",
      entityId: vote.id,
      before: { role: input.role, registrationIds: before.map((w) => w.registrationId) },
      after: { role: input.role, registrationIds: input.registrationIds },
    });
  });
}

// --- Публикация / отмена публикации -------------------------------------------

export async function publishAudienceVoteResults(divisionId: string): Promise<void> {
  const division = await loadDivisionForCompetition(divisionId);
  const actor = await requirePermission("audience_vote:publish", division.competitionId);

  const vote = await prisma.audienceVote.findUniqueOrThrow({ where: { divisionId } });
  const winnersCount = await prisma.audienceVoteWinner.count({ where: { audienceVoteId: vote.id } });
  if (winnersCount === 0) {
    throw new ValidationFailedError("Нельзя опубликовать голосование без подтверждённого победителя — сначала подтвердите победителя.");
  }

  await transition({
    entityType: "AudienceVote",
    entityId: vote.id,
    table: TABLE,
    currentStatus: vote.status,
    statusVersion: vote.statusVersion,
    to: "PUBLISHED",
    actor,
    applyUpdate: async (tx, { to, expectedVersion }) => {
      const result = await tx.audienceVote.updateMany({
        where: { id: vote.id, statusVersion: expectedVersion },
        data: { status: to, statusVersion: { increment: 1 }, publishedAt: new Date(), publishedById: actor.userId },
      });
      return { before: { status: vote.status }, after: { status: to }, updatedCount: result.count };
    },
  });
}

export async function unpublishAudienceVoteResults(divisionId: string, reason: string): Promise<void> {
  const division = await loadDivisionForCompetition(divisionId);
  const actor = await requirePermission("audience_vote:publish", division.competitionId);
  if (!reason.trim()) throw new ValidationFailedError("Нужно указать причину отмены публикации.");

  const vote = await prisma.audienceVote.findUniqueOrThrow({ where: { divisionId } });

  await transition({
    entityType: "AudienceVote",
    entityId: vote.id,
    table: TABLE,
    currentStatus: vote.status,
    statusVersion: vote.statusVersion,
    to: "CLOSED",
    actor,
    reason,
    applyUpdate: async (tx, { to, expectedVersion }) => {
      const result = await tx.audienceVote.updateMany({
        where: { id: vote.id, statusVersion: expectedVersion },
        data: { status: to, statusVersion: { increment: 1 }, publishedAt: null, publishedById: null },
      });
      return { before: { status: vote.status }, after: { status: to }, updatedCount: result.count };
    },
  });
}

// --- Публичный вид (без RBAC — allowlist, как getPublicCompetitionView) ------

type AudienceVotePublicResults = { tally: Record<string, number>; winners: { role: AudienceVoteRole; registrationId: string; voteCount: number }[] };

export type AudienceVotePublicViewData = {
  divisionId: string;
  categoryName: string;
  mode: "GENERAL" | "BY_ROLE";
  displayMode: "NUMBER_ONLY" | "NUMBER_AND_NAME";
  infoText: string | null;
  status: AudienceVoteStatus;
  serverNow: string;
  closesAt: string | null;
  candidates: AudienceVoteCandidate[];
  myVotes: { role: AudienceVoteRole; registrationId: string }[];
  // Тираж и победители — ТОЛЬКО если status === "PUBLISHED" (Q4:
  // "скрыты до закрытия/публикации", план "Приз зрительских симпатий").
  results: AudienceVotePublicResults | null;
};
export type AudienceVotePublicView = AudienceVotePublicViewData | null;

export async function getAudienceVotePublicView(divisionId: string): Promise<AudienceVotePublicView> {
  const division = await prisma.division.findUnique({ where: { id: divisionId }, select: { id: true, category: { select: { name: true } } } });
  if (!division) return null;

  let vote = await prisma.audienceVote.findUnique({ where: { divisionId } });
  if (!vote) return null;
  vote = await autoCloseIfExpired(vote);

  const candidates = await loadCandidates(divisionId);

  const actor: Actor | null = await getActor();
  const myVotes = actor
    ? await prisma.audienceVoteBallot.findMany({
        where: { audienceVoteId: vote.id, voterUserId: actor.userId },
        select: { role: true, registrationId: true },
      })
    : [];

  let results: AudienceVotePublicResults | null = null;
  if (vote.status === "PUBLISHED") {
    const [tally, winners] = await Promise.all([
      tallyFor(vote.id),
      prisma.audienceVoteWinner.findMany({ where: { audienceVoteId: vote.id }, select: { role: true, registrationId: true, voteCount: true } }),
    ]);
    results = { tally: Object.fromEntries(tally), winners };
  }

  return {
    divisionId,
    categoryName: division.category.name,
    mode: vote.mode,
    displayMode: vote.displayMode,
    infoText: vote.infoText,
    status: vote.status,
    serverNow: new Date().toISOString(),
    closesAt: vote.closesAt?.toISOString() ?? null,
    candidates,
    myVotes,
    results,
  };
}

// --- Гейт для UI: может ли текущий актёр управлять голосованием этой категории ---

export async function canManageAudienceVote(competitionId: string): Promise<boolean> {
  const actor = await getActor();
  return can(actor, "audience_vote:manage", competitionId);
}
