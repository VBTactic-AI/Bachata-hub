import type { Prisma, RegistrationRole, ResultStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "../rbac/authorize";
import { writeAudit } from "../audit/audit";
import { ValidationFailedError } from "../errors";

// Официальный протокол результатов дивизиона (Result, Этап 10,
// docs/00_DECISIONS.md) — агрегирует путь участника через RoundResult
// обычных раундов / FinalResult финала в одну версионируемую запись.
// Публикация мест — отдельно, по всему соревнованию сразу (см.
// publishCompetitionResults ниже); здесь — расчёт и проверка по дивизиону.

// Считает официальный протокол дивизиона: идёт от финального (последнего по
// order, обычного — не TIE_BREAK) раунда к первому, для каждого участника
// запоминает САМЫЙ ПОЗДНИЙ раунд, где у него есть результат — это и есть
// "докуда дошёл". Если это финальный раунд — FINALIST с местом (из
// FinalResult.place новой системы финала, либо из RoundResult.rank старой
// системы, если организатор не настраивал критерии, A22); иначе —
// ELIMINATED без места (CLAUDE.md §16 — не выдумываем место тем, кто не
// дошёл до финала). Идемпотентно — если Result для дивизиона уже посчитан,
// повторный вызов ничего не делает (пересчёт через ручную коррекцию,
// correctResult, не через повторный расчёт всего дивизиона).
export async function calculateResults(divisionId: string): Promise<{ createdCount: number }> {
  const division = await prisma.division.findUniqueOrThrow({
    where: { id: divisionId },
    select: { id: true, competitionId: true },
  });
  const actor = await requirePermission("result:calculate", division.competitionId);

  const already = await prisma.result.count({ where: { divisionId } });
  if (already > 0) return { createdCount: 0 };

  const rounds = await prisma.round.findMany({
    where: { divisionId, type: null },
    orderBy: { order: "desc" },
    select: {
      id: true,
      status: true,
      finalSession: { select: { id: true } },
      results: { select: { registrationId: true, rank: true } },
      finalResults: { select: { registrationId: true, place: true } },
    },
  });
  if (rounds.length === 0) {
    throw new ValidationFailedError("У дивизиона нет ни одного раунда — результаты считать не из чего.");
  }

  const finalRound = rounds[0]; // order: "desc" — первый элемент самый поздний
  if (finalRound.status !== "COMPLETED") {
    throw new ValidationFailedError("Финальный раунд дивизиона ещё не завершён — рано считать официальные результаты.");
  }

  const seen = new Set<string>();
  const rows: { registrationId: string; status: ResultStatus; placement: number | null; roundReachedId: string }[] = [];

  for (const round of rounds) {
    const isFinal = round.id === finalRound.id;
    if (round.finalSession) {
      for (const fr of round.finalResults) {
        if (seen.has(fr.registrationId)) continue;
        seen.add(fr.registrationId);
        rows.push({ registrationId: fr.registrationId, status: "FINALIST", placement: fr.place, roundReachedId: round.id });
      }
    } else {
      for (const rr of round.results) {
        if (seen.has(rr.registrationId)) continue;
        seen.add(rr.registrationId);
        rows.push({
          registrationId: rr.registrationId,
          status: isFinal ? "FINALIST" : "ELIMINATED",
          placement: isFinal ? rr.rank : null,
          roundReachedId: round.id,
        });
      }
    }
  }

  if (rows.length > 0) {
    await prisma.$transaction(async (tx) => {
      await tx.result.createMany({
        data: rows.map((r) => ({
          divisionId,
          registrationId: r.registrationId,
          version: 1,
          roundReachedId: r.roundReachedId,
          status: r.status,
          placement: r.placement,
          createdById: actor.userId,
        })),
      });
      await writeAudit(tx, {
        actor,
        action: "result.calculate",
        entityType: "Division",
        entityId: divisionId,
        after: {
          finalistCount: rows.filter((r) => r.status === "FINALIST").length,
          eliminatedCount: rows.filter((r) => r.status === "ELIMINATED").length,
        },
      });
    });
  }

  return { createdCount: rows.length };
}

// Отметка "результаты дивизиона проверены" перед публикацией (03 §23) —
// предпосылка для publishCompetitionResults.
export async function reviewResults(divisionId: string): Promise<void> {
  const division = await prisma.division.findUniqueOrThrow({
    where: { id: divisionId },
    select: { id: true, competitionId: true },
  });
  const actor = await requirePermission("result:review", division.competitionId);

  const count = await prisma.result.count({ where: { divisionId } });
  if (count === 0) {
    throw new ValidationFailedError("Сначала нужно рассчитать результаты дивизиона.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.division.update({
      where: { id: divisionId },
      data: { resultsReviewedAt: new Date(), resultsReviewedById: actor.userId },
    });
    await writeAudit(tx, { actor, action: "result.review", entityType: "Division", entityId: divisionId });
  });
}

// Последняя (текущая) версия Result на каждую пару (divisionId,
// registrationId) — общая выборка для readiness-проверки и публикации.
async function latestResultsForCompetition(tx: Prisma.TransactionClient | typeof prisma, competitionId: string) {
  const all = await tx.result.findMany({ where: { division: { competitionId } } });
  const latestByKey = new Map<string, (typeof all)[number]>();
  for (const r of all) {
    const key = `${r.divisionId}:${r.registrationId}`;
    const cur = latestByKey.get(key);
    if (!cur || r.version > cur.version) latestByKey.set(key, r);
  }
  return [...latestByKey.values()];
}

// Проверка готовности перед публикацией результатов ВСЕГО соревнования
// (список проблем, не исключение — CLAUDE.md §46, организатор должен видеть
// все причины сразу, по образцу checkFinalReadiness, start-final.ts).
// Публикация мест — только разом по всему соревнованию (уточнено
// пользователем, 2026-09-04): каждый дивизион обязан быть рассчитан и
// проверен, прежде чем можно опубликовать хоть один.
export async function checkCompetitionResultsReadiness(competitionId: string): Promise<string[]> {
  const divisions = await prisma.division.findMany({
    where: { competitionId },
    select: {
      id: true,
      resultsReviewedAt: true,
      category: { select: { name: true } },
      rounds: { where: { type: null }, orderBy: { order: "desc" }, take: 1, select: { status: true } },
      _count: { select: { results: true } },
    },
  });

  const issues: string[] = [];
  for (const d of divisions) {
    const finalRound = d.rounds[0];
    if (!finalRound) {
      issues.push(`«${d.category.name}»: нет ни одного раунда`);
      continue;
    }
    if (finalRound.status !== "COMPLETED") {
      issues.push(`«${d.category.name}»: финальный раунд ещё не завершён`);
      continue;
    }
    if (d._count.results === 0) {
      issues.push(`«${d.category.name}»: результаты ещё не рассчитаны`);
      continue;
    }
    if (!d.resultsReviewedAt) {
      issues.push(`«${d.category.name}»: результаты рассчитаны, но не отмечены проверенными`);
    }
  }
  return issues;
}

// Публикация официальных мест ВСЕГО соревнования разом (03 §23, уточнено
// пользователем 2026-09-04 — не по дивизиону отдельно). Проставляет
// publishedAt текущей версии каждого Result соревнования и переключает
// Competition.publicResults (поле заведено ещё на Этапе 1, до этой публикации
// не использовалось). Идемпотентно для уже опубликованных строк — повторный
// вызов просто обновит timestamp/актёра, ничего не потеряет.
export async function publishCompetitionResults(competitionId: string): Promise<{ publishedCount: number }> {
  const actor = await requirePermission("result:publish", competitionId);

  const issues = await checkCompetitionResultsReadiness(competitionId);
  if (issues.length > 0) {
    throw new ValidationFailedError(`Нельзя опубликовать результаты соревнования: ${issues.join("; ")}.`);
  }

  const publishedCount = await prisma.$transaction(async (tx) => {
    const latest = await latestResultsForCompetition(tx, competitionId);
    const ids = latest.map((r) => r.id);
    if (ids.length > 0) {
      await tx.result.updateMany({
        where: { id: { in: ids } },
        data: { publishedAt: new Date(), publishedById: actor.userId },
      });
    }
    await tx.competition.update({ where: { id: competitionId }, data: { publicResults: true } });
    await writeAudit(tx, {
      actor,
      action: "result.publish",
      entityType: "Competition",
      entityId: competitionId,
      after: { publishedCount: ids.length },
    });
    return ids.length;
  });

  return { publishedCount };
}

// Отмена публикации (HEAD_JUDGE/EVENT_ADMIN, уточнено пользователем
// 2026-09-04 — не только SUPER_ADMIN, как в 03 §4). Не стирает publishedAt
// уже опубликованных Result (история публикации сохраняется, CLAUDE.md §51)
// — видимость целиком управляется Competition.publicResults, повторная
// публикация просто включает его снова.
export async function unpublishCompetitionResults(competitionId: string, reason: string): Promise<void> {
  const actor = await requirePermission("result:unpublish", competitionId);
  if (!reason.trim()) {
    throw new ValidationFailedError("Нужно указать причину отмены публикации.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.competition.update({ where: { id: competitionId }, data: { publicResults: false } });
    await writeAudit(tx, { actor, action: "result.unpublish", entityType: "Competition", entityId: competitionId, reason });
  });
}

// Correction workflow (CLAUDE.md §29-30): исправление официального
// результата — всегда через новую версию с обязательной причиной, старая
// строка остаётся нетронутой. Работает и до, и после публикации (единый
// путь, а не два разных механизма) — если предыдущая версия уже была
// опубликована, новая версия публикуется сразу же (иначе публично
// показанное место осталось бы неверным); если черновик ещё не публиковался
// — новая версия тоже остаётся черновиком.
export async function correctResult(
  resultId: string,
  data: { status: ResultStatus; placement: number | null },
  reason: string
): Promise<void> {
  if (!reason.trim()) {
    throw new ValidationFailedError("Нужно указать причину исправления.");
  }
  const target = await prisma.result.findUniqueOrThrow({
    where: { id: resultId },
    include: { division: { select: { competitionId: true } } },
  });
  const actor = await requirePermission("result:publish", target.division.competitionId);

  await prisma.$transaction(async (tx) => {
    const latest = await tx.result.findFirstOrThrow({
      where: { divisionId: target.divisionId, registrationId: target.registrationId },
      orderBy: { version: "desc" },
    });
    const created = await tx.result.create({
      data: {
        divisionId: latest.divisionId,
        registrationId: latest.registrationId,
        version: latest.version + 1,
        roundReachedId: latest.roundReachedId,
        status: data.status,
        placement: data.placement,
        publishedAt: latest.publishedAt ? new Date() : null,
        publishedById: latest.publishedAt ? actor.userId : null,
        createdById: actor.userId,
        reason,
      },
    });
    await writeAudit(tx, {
      actor,
      action: "result.correct",
      entityType: "Result",
      entityId: created.id,
      before: { status: latest.status, placement: latest.placement, version: latest.version },
      after: { status: created.status, placement: created.placement, version: created.version },
      reason,
    });
  });
}

export type OfficialResultRow = {
  id: string;
  registrationId: string;
  role: RegistrationRole;
  displayName: string;
  bibNumber: string | null;
  status: ResultStatus;
  placement: number | null;
  version: number;
  publishedAt: Date | null;
};

// Текущая (последняя версия) официальная таблица результатов дивизиона —
// для админского UI (черновик до публикации, протокол после).
export async function getCurrentDivisionResults(divisionId: string): Promise<OfficialResultRow[]> {
  const all = await prisma.result.findMany({
    where: { divisionId },
    include: {
      registration: { select: { role: true, dancer: { select: { displayName: true } }, checkIn: { select: { bibNumber: true } } } },
    },
    orderBy: { version: "desc" },
  });
  const latestByRegistration = new Map<string, (typeof all)[number]>();
  for (const r of all) {
    if (!latestByRegistration.has(r.registrationId)) latestByRegistration.set(r.registrationId, r);
  }
  return [...latestByRegistration.values()].map((r) => ({
    id: r.id,
    registrationId: r.registrationId,
    role: r.registration.role,
    displayName: r.registration.dancer.displayName,
    bibNumber: r.registration.checkIn?.bibNumber ?? null,
    status: r.status,
    placement: r.placement,
    version: r.version,
    publishedAt: r.publishedAt,
  }));
}
