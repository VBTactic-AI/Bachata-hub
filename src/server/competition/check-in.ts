import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "../rbac/authorize";
import { writeAudit } from "../audit/audit";
import { ValidationFailedError } from "../errors";

// Bib-номер — следующий свободный по порядку в рамках соревнования
// (docs/00_DECISIONS.md, B4), выдаётся сервером при check-in, а не заранее.
export async function checkInRegistration(registrationId: string, opts?: { late?: boolean }) {
  const registration = await prisma.registration.findUniqueOrThrow({
    where: { id: registrationId },
    select: { id: true, competitionId: true, status: true },
  });
  const actor = await requirePermission("checkin:manage", registration.competitionId);

  if (registration.status !== "REGISTERED") {
    throw new ValidationFailedError("Участник не в статусе REGISTERED — check-in невозможен.");
  }

  return prisma.$transaction(async (tx) => {
    // "Уже зачекинен" отдельным pre-check'ом больше не проверяем — это тот же
    // самый uniq-индекс на registrationId, что и в catch(P2002) ниже, с тем же
    // текстом ошибки; отдельный round-trip к пулеру Supabase (~50-150мс,
    // см. диагностику производительности check-in, 2026-09-06) не добавлял
    // ничего, кроме задержки на общем пути.
    //
    // Ретрай на случай гонки за один и тот же номер (03 §27) — на стойке
    // check-in могут работать несколько волонтёров одновременно, поэтому
    // pre-check clash'а (в отличие от "уже зачекинен" выше) оставляем: без
    // него конкурентный check-in чаще ловил бы "попробуйте ещё раз" вместо
    // прохождения с первой попытки. count() считаем один раз — он не может
    // измениться внутри нашей же незакоммиченной транзакции между попытками.
    let bibNumber: string | null = null;
    const count = await tx.checkIn.count({ where: { competitionId: registration.competitionId } });
    for (let attempt = 0; attempt < 5 && !bibNumber; attempt++) {
      const candidate = String(count + 1 + attempt);
      const clash = await tx.checkIn.findUnique({
        where: { competitionId_bibNumber: { competitionId: registration.competitionId, bibNumber: candidate } },
      });
      if (!clash) bibNumber = candidate;
    }
    if (!bibNumber) throw new ValidationFailedError("Не удалось выдать номер участника, попробуйте ещё раз.");

    // FLOW-003: и "уже зачекинен" (registrationId), и "номер занят"
    // (competitionId+bibNumber) защищены уникальными индексами на уровне БД —
    // но проверки выше (findUnique) успевают проверить только ДО этой
    // записи; два по-настоящему одновременных check-in могут пройти обе
    // проверки и столкнуться только здесь. Без этого catch ошибка Prisma
    // (P2002) падала в общий 500 вместо понятного сообщения.
    let created;
    try {
      created = await tx.checkIn.create({
        data: {
          registrationId,
          competitionId: registration.competitionId,
          status: opts?.late ? "LATE" : "CHECKED_IN",
          bibNumber,
          checkedInById: actor.userId,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const target = Array.isArray(e.meta?.target) ? (e.meta.target as string[]) : [];
        if (target.includes("registrationId")) {
          throw new ValidationFailedError("Check-in для этого участника уже выполнен.");
        }
        throw new ValidationFailedError("Не удалось выдать номер участника, попробуйте ещё раз.");
      }
      throw e;
    }

    await writeAudit(tx, {
      actor,
      action: "checkin.create",
      entityType: "CheckIn",
      entityId: created.id,
      after: { registrationId, bibNumber, status: created.status },
    });

    return created;
  });
}

// Изменить номер участника вручную (2026-09-12, по прямому запросу
// пользователя) — организатор иногда должен поправить bib-номер (опечатка
// при выдаче, нужно освободить/поменять номер местами и т.д.). В отличие от
// автовыдачи при check-in (следующий свободный по порядку), здесь номер
// вводит человек — обязательна проверка, что такой номер уже не занят другим
// участником ЭТОГО ЖЕ соревнования (та же область уникальности, что и
// @@unique([competitionId, bibNumber]) в схеме), с понятной ошибкой вместо
// голого P2002 (CLAUDE.md §46).
export async function changeBibNumber(registrationId: string, newBibNumber: string): Promise<void> {
  const trimmed = newBibNumber.trim();
  if (!trimmed) {
    throw new ValidationFailedError("Номер участника не может быть пустым.");
  }

  const registration = await prisma.registration.findUniqueOrThrow({
    where: { id: registrationId },
    select: { id: true, competitionId: true, checkIn: { select: { id: true, bibNumber: true } } },
  });
  const actor = await requirePermission("checkin:manage", registration.competitionId);

  if (!registration.checkIn) {
    throw new ValidationFailedError("У участника ещё нет check-in — номеру неоткуда взяться.");
  }
  if (registration.checkIn.bibNumber === trimmed) return; // тот же номер — ничего менять не нужно

  const clash = await prisma.checkIn.findUnique({
    where: { competitionId_bibNumber: { competitionId: registration.competitionId, bibNumber: trimmed } },
  });
  if (clash) {
    throw new ValidationFailedError(`Номер ${trimmed} уже присвоен другому участнику этого соревнования.`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.checkIn.update({ where: { id: registration.checkIn!.id }, data: { bibNumber: trimmed } });
    await writeAudit(tx, {
      actor,
      action: "checkin.change_bib_number",
      entityType: "CheckIn",
      entityId: registration.checkIn!.id,
      before: { bibNumber: registration.checkIn!.bibNumber },
      after: { bibNumber: trimmed },
    });
  });
}

// Отмена check-in (redesign вкладки "Участники", 2026-09-09 — тумблер
// должен реально работать в обе стороны). Физически удаляет запись CheckIn
// (bib-номер освобождается — следующий check-in получит новый, по тому же
// принципу, что и первый check-in выше), но история не теряется: audit-запись
// с before/after остаётся в AuditLog (CLAUDE.md §18 — теряется только сама
// строка таблицы, не факт "кто/когда отменил").
export async function cancelCheckIn(registrationId: string): Promise<void> {
  const registration = await prisma.registration.findUniqueOrThrow({
    where: { id: registrationId },
    select: { id: true, competitionId: true, checkIn: true },
  });
  const actor = await requirePermission("checkin:manage", registration.competitionId);

  if (!registration.checkIn) {
    throw new ValidationFailedError("Участник ещё не прошёл check-in — отменять нечего.");
  }

  await prisma.$transaction(async (tx) => {
    await writeAudit(tx, {
      actor,
      action: "checkin.cancel",
      entityType: "CheckIn",
      entityId: registration.checkIn!.id,
      before: { registrationId, bibNumber: registration.checkIn!.bibNumber, status: registration.checkIn!.status },
    });
    await tx.checkIn.delete({ where: { registrationId } });
  });
}
