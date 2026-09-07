import type { Prisma, RegistrationRole, ResultStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "../rbac/authorize";
import { writeAudit, writeAuditMany } from "../audit/audit";
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

// Проверяет, что место свободно среди ТЕКУЩИХ (последняя version на
// registrationId) FINALIST-строк дивизиона+роли — не считая самого
// исправляемого участника. Найдено вживую (2026-09-07/08): ручная
// коррекция одного Result безусловно принимала любое число, и админ мог
// поставить двух разных участников на одно и то же место (место 2 у обоих,
// место 3 не занято никем) — БД не должна допускать такое состояние вообще
// (CLAUDE.md §19 — как и при отсеве, ничья/дублирование места не решается
// произвольным выбором). correctResult() (одна строка) теперь ОТКАЗЫВАЕТ в
// таком исправлении вместо того, чтобы создать дубликат; для настоящего
// обмена местами (частый случай реальной правки) — swapResultPlacements()
// ниже, меняет оба места одной транзакцией, так что дублирования не бывает
// даже транзитно.
async function assertPlacementFree(
  tx: Prisma.TransactionClient,
  params: { divisionId: string; role: RegistrationRole; placement: number; excludeRegistrationId: string }
): Promise<void> {
  const all = await tx.result.findMany({
    where: { divisionId: params.divisionId, registration: { role: params.role } },
    select: {
      registrationId: true,
      version: true,
      status: true,
      placement: true,
      registration: { select: { dancer: { select: { displayName: true } }, checkIn: { select: { bibNumber: true } } } },
    },
  });
  const latestByRegistration = new Map<string, (typeof all)[number]>();
  for (const r of all) {
    const cur = latestByRegistration.get(r.registrationId);
    if (!cur || r.version > cur.version) latestByRegistration.set(r.registrationId, r);
  }
  const holder = [...latestByRegistration.values()].find(
    (r) => r.registrationId !== params.excludeRegistrationId && r.status === "FINALIST" && r.placement === params.placement
  );
  if (holder) {
    throw new ValidationFailedError(
      `Место ${params.placement} уже занято участником №${holder.registration.checkIn?.bibNumber ?? "—"} ${holder.registration.dancer.displayName} — сначала измените его место, либо используйте обмен местами (swapResultPlacements).`
    );
  }
}

// Correction workflow (CLAUDE.md §29-30): исправление официального
// результата — всегда через новую версию с обязательной причиной, старая
// строка остаётся нетронутой. Работает и до, и после публикации (единый
// путь, а не два разных механизма) — если предыдущая версия уже была
// опубликована, новая версия публикуется сразу же (иначе публично
// показанное место осталось бы неверным); если черновик ещё не публиковался
// — новая версия тоже остаётся черновиком. Место обязано быть свободным
// среди текущих FINALIST дивизиона+роли (assertPlacementFree) — БД не
// должна допускать двух участников на одном месте одновременно.
export async function correctResult(
  resultId: string,
  data: { status: ResultStatus; placement: number | null },
  reason: string
): Promise<void> {
  if (!reason.trim()) {
    throw new ValidationFailedError("Нужно указать причину исправления.");
  }
  // RESULT-001: та же проверка, что и в схеме API (correctResultSchema) —
  // повторена здесь, потому что эта функция вызываема и напрямую из
  // серверного кода, в обход HTTP-слоя валидации.
  if ((data.status === "FINALIST") !== (data.placement !== null)) {
    throw new ValidationFailedError("У финалиста обязано быть место, у выбывшего участника — не должно быть.");
  }
  const target = await prisma.result.findUniqueOrThrow({
    where: { id: resultId },
    include: { division: { select: { competitionId: true } }, registration: { select: { role: true } } },
  });
  const actor = await requirePermission("result:publish", target.division.competitionId);

  await prisma.$transaction(async (tx) => {
    const latest = await tx.result.findFirstOrThrow({
      where: { divisionId: target.divisionId, registrationId: target.registrationId },
      orderBy: { version: "desc" },
    });

    if (data.status === "FINALIST") {
      await assertPlacementFree(tx, {
        divisionId: target.divisionId,
        role: target.registration.role,
        placement: data.placement!,
        excludeRegistrationId: target.registrationId,
      });
    }

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

// Обмен местами между двумя ФИНАЛИСТАМИ одной роли одного дивизиона —
// единственный безопасный способ поменять двух людей местами, раз
// correctResult() (одна строка) теперь отказывает в занятом месте
// (assertPlacementFree выше). Обе строки меняются местами в ОДНОЙ
// транзакции: в БД никогда не бывает промежуточного состояния ни с
// дубликатом места, ни с "дыркой" — это ровно тот кейс, который раньше
// ломался при ручном исправлении по одному участнику за раз (2026-09-08).
export async function swapResultPlacements(resultIdA: string, resultIdB: string, reason: string): Promise<void> {
  if (!reason.trim()) {
    throw new ValidationFailedError("Нужно указать причину обмена местами.");
  }
  if (resultIdA === resultIdB) {
    throw new ValidationFailedError("Нельзя поменять местами участника с самим собой.");
  }
  const [a, b] = await Promise.all([
    prisma.result.findUniqueOrThrow({
      where: { id: resultIdA },
      include: { division: { select: { competitionId: true } }, registration: { select: { role: true } } },
    }),
    prisma.result.findUniqueOrThrow({
      where: { id: resultIdB },
      include: { division: { select: { competitionId: true } }, registration: { select: { role: true } } },
    }),
  ]);
  if (a.divisionId !== b.divisionId || a.registration.role !== b.registration.role) {
    throw new ValidationFailedError("Меняться местами могут только два финалиста одной роли одного дивизиона.");
  }
  if (a.registrationId === b.registrationId) {
    throw new ValidationFailedError("Это один и тот же участник.");
  }
  const actor = await requirePermission("result:publish", a.division.competitionId);

  await prisma.$transaction(async (tx) => {
    const [latestA, latestB] = await Promise.all([
      tx.result.findFirstOrThrow({ where: { divisionId: a.divisionId, registrationId: a.registrationId }, orderBy: { version: "desc" } }),
      tx.result.findFirstOrThrow({ where: { divisionId: b.divisionId, registrationId: b.registrationId }, orderBy: { version: "desc" } }),
    ]);
    if (latestA.status !== "FINALIST" || latestB.status !== "FINALIST" || latestA.placement === null || latestB.placement === null) {
      throw new ValidationFailedError("Меняться местами могут только два действующих финалиста (у обоих должно быть место).");
    }

    const createdA = await tx.result.create({
      data: {
        divisionId: latestA.divisionId,
        registrationId: latestA.registrationId,
        version: latestA.version + 1,
        roundReachedId: latestA.roundReachedId,
        status: "FINALIST",
        placement: latestB.placement,
        publishedAt: latestA.publishedAt ? new Date() : null,
        publishedById: latestA.publishedAt ? actor.userId : null,
        createdById: actor.userId,
        reason,
      },
    });
    const createdB = await tx.result.create({
      data: {
        divisionId: latestB.divisionId,
        registrationId: latestB.registrationId,
        version: latestB.version + 1,
        roundReachedId: latestB.roundReachedId,
        status: "FINALIST",
        placement: latestA.placement,
        publishedAt: latestB.publishedAt ? new Date() : null,
        publishedById: latestB.publishedAt ? actor.userId : null,
        createdById: actor.userId,
        reason,
      },
    });
    await writeAuditMany(tx, [
      {
        actor,
        action: "result.swap",
        entityType: "Result",
        entityId: createdA.id,
        before: { placement: latestA.placement, version: latestA.version },
        after: { placement: createdA.placement, version: createdA.version, swappedWith: createdB.id },
        reason,
      },
      {
        actor,
        action: "result.swap",
        entityType: "Result",
        entityId: createdB.id,
        before: { placement: latestB.placement, version: latestB.version },
        after: { placement: createdB.placement, version: createdB.version, swappedWith: createdA.id },
        reason,
      },
    ]);
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
