import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { transitionRound } from "../state/round-state";
import { formDrawInTx, type CallOrder } from "./draw-engine";
import { ValidationFailedError } from "../errors";

// Одна кнопка "Начать жеребьёвку" на весь раунд: организатор один раз
// выбирает порядок вызова участников (SEQUENTIAL/RANDOM) — сохраняется в
// Round.config, применяется ко всем заездам раунда — и сразу формируются
// списки вызванных для КАЖДОГО заезда раунда по очереди (не по одной кнопке
// на заезд), одной транзакцией вместе с переходом READY -> DRAWING.
// Дальше отдельные заезды можно пересобрать (reroll) поштучно —
// draw-engine.ts, rerollHeatDraw.
export async function startRoundDrawing(roundId: string, callOrder: CallOrder): Promise<void> {
  const round = await prisma.round.findUniqueOrThrow({
    where: { id: roundId },
    include: { division: { select: { id: true, heatCapacity: true } } },
  });

  const heats = await prisma.heat.findMany({ where: { roundId }, orderBy: { number: "asc" } });
  if (heats.length === 0) {
    throw new ValidationFailedError("В раунде нет ни одного захода — сначала создайте заходы.");
  }

  const heatCapacity = round.heatCapacity ?? round.division.heatCapacity;
  const existingConfig = (round.config ?? {}) as Record<string, unknown>;
  const newConfig = { ...existingConfig, drawCallOrder: callOrder };

  await transitionRound(roundId, "DRAWING", {
    extraData: { config: newConfig as Prisma.InputJsonValue },
    onApplied: async (tx, actor) => {
      for (const heat of heats) {
        await formDrawInTx(tx, {
          heatId: heat.id,
          roundId,
          roundOrder: round.order,
          divisionId: round.divisionId,
          heatCapacity,
          callOrder,
          actor,
        });
      }
    },
  });
}
