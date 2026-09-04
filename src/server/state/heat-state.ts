import type { HeatStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { transition, type TransitionTable } from "./machine";
import { requirePermission } from "../rbac/authorize";
import type { Permission } from "../rbac/permissions";
import { ValidationFailedError } from "../errors";
import { ROUND_TYPE_LABELS } from "@/lib/competition-labels";
import { finishRotationInTx } from "../rotation/rotation-engine";
import { autoAdvanceRoundIfAllHeatsFinishedInTx } from "./round-state";

const TABLE: TransitionTable<HeatStatus> = {
  PENDING: ["RUNNING"],
  RUNNING: ["PAUSED", "FINISHED"],
  PAUSED: ["RUNNING"],
  FINISHED: [],
};

function permissionFor(to: HeatStatus): Permission {
  return to === "PAUSED" ? "round:pause" : to === "FINISHED" ? "round:end" : "round:start";
}

// Идемпотентность START_HEAT (CLAUDE.md §11): повторный вызов на уже
// RUNNING heat не запускает его дважды — таблица переходов просто не
// разрешает PENDING/RUNNING -> RUNNING как "переход" сама по себе, а
// оптимистичная блокировка в machine.transition() ловит гонку двух
// одновременных попыток запуска (03 §27).
export async function transitionHeat(heatId: string, to: HeatStatus, opts?: { reason?: string }): Promise<void> {
  const heat = await prisma.heat.findUniqueOrThrow({
    where: { id: heatId },
    include: { round: { include: { division: { select: { competitionId: true } } } } },
  });
  const competitionId = heat.round.division.competitionId;
  const actor = await requirePermission(permissionFor(to), competitionId);

  await transition({
    entityType: "Heat",
    entityId: heatId,
    table: TABLE,
    currentStatus: heat.status,
    statusVersion: heat.statusVersion,
    to,
    actor,
    reason: opts?.reason,
    // На паркете физически может танцевать только один заезд одновременно —
    // схема не моделирует несколько площадок (Stage/Floor), поэтому пока
    // ограничение действует на всё соревнование целиком (docs/00_DECISIONS.md,
    // A4). PAUSED тоже считается "занимающим паркет" — пары просто ждут, а не
    // разошлись, следующий заезд запускать рано.
    guard: async (tx) => {
      if (to !== "RUNNING") return;
      // Заезд не может стартовать раньше собственного раунда — раунд обязан
      // быть в RUNNING (значит жеребьёвка для него уже зафиксирована,
      // DRAW_LOCKED -> RUNNING), иначе заезд запустился бы "пустым", без
      // единого вызванного участника (обнаружено на реальном тесте).
      if (heat.round.status !== "RUNNING") {
        throw new ValidationFailedError(
          `Нельзя запустить этот заход: раунд ещё не переведён в статус "Идёт" (сначала жеребьёвка, потом запуск раунда).`
        );
      }
      // Заходы одного раунда идут строго по номеру — нельзя запустить заход
      // №3, пока заход №1 или №2 ещё не завершён (даже если они ещё не
      // запускались вовсе, PENDING). По духу то же самое, что A8 для
      // раундов внутри дивизиона, только уровнем ниже — заходы внутри раунда.
      const earlierUnfinished = await tx.heat.findFirst({
        where: { roundId: heat.roundId, number: { lt: heat.number }, status: { not: "FINISHED" } },
        orderBy: { number: "asc" },
      });
      if (earlierUnfinished) {
        throw new ValidationFailedError(
          `Нельзя запустить этот заход: заход №${earlierUnfinished.number} этого раунда ещё не завершён — сначала завершите его.`
        );
      }
      const activeElsewhere = await tx.heat.findFirst({
        where: {
          id: { not: heatId },
          status: { in: ["RUNNING", "PAUSED"] },
          round: { division: { competitionId } },
        },
        include: { round: { select: { type: true, stage: { select: { name: true } } } } },
      });
      if (activeElsewhere) {
        const roundName =
          activeElsewhere.round.stage?.name ??
          (activeElsewhere.round.type ? (ROUND_TYPE_LABELS[activeElsewhere.round.type] ?? activeElsewhere.round.type) : "раунда");
        throw new ValidationFailedError(
          `Нельзя запустить этот заход: сейчас уже идёт (или на паузе) заход №${activeElsewhere.number} раунда «${roundName}» — сначала завершите его.`
        );
      }
    },
    applyUpdate: async (tx, { to, expectedVersion }) => {
      const result = await tx.heat.updateMany({
        where: { id: heatId, statusVersion: expectedVersion },
        data: { status: to, statusVersion: { increment: 1 } },
      });
      // Заезд завершается вместе со своей ротацией партнёров одной
      // транзакцией (Этап 6) — не отдельной кнопкой "Завершить ротацию".
      if (result.count > 0 && to === "FINISHED") {
        await finishRotationInTx(tx, heatId, actor);
        // Если это был последний незавершённый заход раунда — раунд сам
        // идёт RUNNING -> FINISHED -> SCORING в этой же транзакции (по
        // запросу пользователя, 2026-09-04): кнопка не нужна.
        await autoAdvanceRoundIfAllHeatsFinishedInTx(tx, heat.roundId, actor);
      }
      return {
        before: { status: heat.status, statusVersion: expectedVersion },
        after: { status: to, statusVersion: expectedVersion + 1 },
        updatedCount: result.count,
      };
    },
  });
}
