import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { transitionRound } from "../state/round-state";
import { formDrawInTx, type CallOrder } from "./draw-engine";
import { ValidationFailedError } from "../errors";
import { isFinalStageInTx } from "../judging/advancement";

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
    include: { division: { select: { id: true, heatCapacity: true } }, finalSession: { select: { id: true } } },
  });

  // Финальный раунд дивизиона обязан пройти через "Начать финал" (startFinal,
  // start-final.ts) ДО жеребьёвки — та фиксирует критерии в FinalSession, без
  // которой судьи получат обычную схему Да/Нет вместо критериальной (баг,
  // найденный на живом тестировании 2026-09-05: UI-кнопка "Начать жеребьёвку"
  // была видна и для финала, ничего на сервере это не проверяло). CLAUDE.md
  // §53 — бизнес-правило не должно держаться только на том, что кнопку в UI
  // спрятали.
  if (round.type === null && !round.finalSession) {
    const isFinal = await isFinalStageInTx(prisma, round.divisionId, round.order);
    if (isFinal) {
      throw new ValidationFailedError(
        'Это финальный раунд дивизиона — сначала нажмите "Начать финал" (фиксирует критерии оценки), а не "Начать жеребьёвку" напрямую.'
      );
    }
  }

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
