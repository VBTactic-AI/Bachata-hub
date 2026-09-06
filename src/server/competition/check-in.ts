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
