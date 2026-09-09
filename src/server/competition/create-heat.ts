import { prisma } from "@/lib/prisma";
import { requirePermission } from "../rbac/authorize";
import { writeAudit } from "../audit/audit";
import { ValidationFailedError } from "../errors";

// Отдельного права "heat:create" в каталоге нет (03 §4 группирует заезды под
// правами раунда) — переиспользуем round:create, как уже сделано для
// DRAFT -> READY перехода раунда в round-state.ts.
export async function createHeat(roundId: string): Promise<{ id: string }> {
  const round = await prisma.round.findUniqueOrThrow({
    where: { id: roundId },
    include: { division: { select: { competitionId: true } } },
  });
  const actor = await requirePermission("round:create", round.division.competitionId);

  // FLOW-001: после DRAW_LOCKED у каждого захода раунда уже обязана быть
  // жеребьёвка (round-state.ts, гарантируется один раз, в момент фиксации) —
  // новый заезд без списка нарушил бы этот инвариант молча, и его можно
  // было бы запустить, минуя весь Draw Engine. UI прячет кнопку по тому же
  // условию (page.tsx), но это только клиентская подсказка — раньше сервер
  // ничего не проверял (CLAUDE.md §45).
  if (round.status !== "DRAFT" && round.status !== "READY" && round.status !== "DRAWING") {
    throw new ValidationFailedError(
      `Нельзя добавить заезд: раунд уже прошёл стадию жеребьёвки (статус "${round.status}").`
    );
  }

  const heat = await prisma.$transaction(async (tx) => {
    const last = await tx.heat.findFirst({ where: { roundId }, orderBy: { number: "desc" } });
    const number = (last?.number ?? 0) + 1;

    const created = await tx.heat.create({ data: { roundId, number } });

    await writeAudit(tx, {
      actor,
      action: "heat.create",
      entityType: "Heat",
      entityId: created.id,
      after: { roundId, number },
    });

    return created;
  });

  return { id: heat.id };
}

// Удаление заезда (запрос пользователя, 2026-09-09 — организатор мог по
// ошибке нажать "+ Заход" лишний раз, а обратной кнопки не было).
// Сознательно ОЧЕНЬ узкая область: только PENDING-заезд, для которого ЕЩЁ
// НЕТ ни одной жеребьёвки. Заезд с уже сформированной жеребьёвкой не
// удаляется — это молча убрало бы реальных участников из раунда без
// перераспределения (нарушение CLAUDE.md §18/§60); для такого случая уже
// есть другие, явные инструменты — "Разбить на 2 выхода" и пересборка. Номер
// удалённого заезда не переиспользуется ("+ Заход" всегда берёт максимум+1)
// — как и с bib-номерами, разрыв в нумерации не считается проблемой, это
// дешевле, чем тихо переносить историю на другой номер.
export async function deleteHeat(heatId: string): Promise<void> {
  const heat = await prisma.heat.findFirstOrThrow({
    where: { id: heatId },
    relationLoadStrategy: "join",
    include: {
      round: { include: { division: { select: { competitionId: true } } } },
      _count: { select: { draws: true } },
    },
  });
  const competitionId = heat.round.division.competitionId;
  const actor = await requirePermission("round:create", competitionId);

  if (heat.status !== "PENDING") {
    throw new ValidationFailedError(
      `Нельзя удалить заход №${heat.number}: он уже запускался (статус "${heat.status}").`
    );
  }
  if (heat._count.draws > 0) {
    throw new ValidationFailedError(
      `Нельзя удалить заход №${heat.number}: для него уже сформирована жеребьёвка. Используйте пересборку или «Разбить на 2 выхода», если нужно изменить состав.`
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.heat.delete({ where: { id: heatId } });
    await writeAudit(tx, {
      actor,
      action: "heat.delete",
      entityType: "Heat",
      entityId: heatId,
      before: { roundId: heat.roundId, number: heat.number, status: heat.status },
    });
  });
}
