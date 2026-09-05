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
