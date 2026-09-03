import { describe, it, expect, vi, beforeEach } from "vitest";

const transitionRoundMock = vi.fn();
vi.mock("@/server/state/round-state", () => ({ transitionRound: (...a: unknown[]) => transitionRoundMock(...a) }));

const formDrawInTxMock = vi.fn();
vi.mock("@/server/competition/draw-engine", () => ({ formDrawInTx: (...a: unknown[]) => formDrawInTxMock(...a) }));

const roundFindUniqueOrThrow = vi.fn();
const heatFindMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    round: { findUniqueOrThrow: (...a: unknown[]) => roundFindUniqueOrThrow(...a) },
    heat: { findMany: (...a: unknown[]) => heatFindMany(...a) },
  },
}));

const { startRoundDrawing } = await import("@/server/competition/start-round-drawing");
const { ValidationFailedError } = await import("@/server/errors");

beforeEach(() => {
  transitionRoundMock.mockReset().mockResolvedValue(undefined);
  formDrawInTxMock.mockReset().mockResolvedValue({ id: "draw1", leaderCount: 1, followerCount: 1 });
  roundFindUniqueOrThrow.mockReset().mockResolvedValue({
    id: "round1",
    divisionId: "div1",
    heatCapacity: null,
    config: {},
    division: { id: "div1", heatCapacity: 10 },
  });
  heatFindMany.mockReset().mockResolvedValue([
    { id: "heat1", number: 1 },
    { id: "heat2", number: 2 },
  ]);
});

describe("startRoundDrawing()", () => {
  it("отклоняет, если в раунде нет заездов", async () => {
    heatFindMany.mockResolvedValue([]);
    await expect(startRoundDrawing("round1", "RANDOM")).rejects.toBeInstanceOf(ValidationFailedError);
    expect(transitionRoundMock).not.toHaveBeenCalled();
  });

  it("передаёт выбранный callOrder в Round.config через extraData", async () => {
    await startRoundDrawing("round1", "RANDOM");
    expect(transitionRoundMock).toHaveBeenCalledWith(
      "round1",
      "DRAWING",
      expect.objectContaining({ extraData: { config: { drawCallOrder: "RANDOM" } } })
    );
  });

  it("сохраняет уже существующие поля config, добавляя drawCallOrder", async () => {
    roundFindUniqueOrThrow.mockResolvedValue({
      id: "round1",
      divisionId: "div1",
      heatCapacity: null,
      config: { someOtherFlag: true },
      division: { id: "div1", heatCapacity: 10 },
    });

    await startRoundDrawing("round1", "SEQUENTIAL");

    expect(transitionRoundMock).toHaveBeenCalledWith(
      "round1",
      "DRAWING",
      expect.objectContaining({ extraData: { config: { someOtherFlag: true, drawCallOrder: "SEQUENTIAL" } } })
    );
  });

  it("onApplied формирует жеребьёвку для КАЖДОГО заезда раунда по порядку номера", async () => {
    await startRoundDrawing("round1", "RANDOM");

    const onApplied = transitionRoundMock.mock.calls[0][2].onApplied;
    const tx = {};
    const actor = { userId: "u1" };
    await onApplied(tx, actor);

    expect(formDrawInTxMock).toHaveBeenCalledTimes(2);
    expect(formDrawInTxMock).toHaveBeenNthCalledWith(
      1,
      tx,
      expect.objectContaining({ heatId: "heat1", roundId: "round1", divisionId: "div1", callOrder: "RANDOM", actor })
    );
    expect(formDrawInTxMock).toHaveBeenNthCalledWith(2, tx, expect.objectContaining({ heatId: "heat2" }));
  });

  it("использует heatCapacity раунда, если он задан, иначе дивизиона", async () => {
    roundFindUniqueOrThrow.mockResolvedValue({
      id: "round1",
      divisionId: "div1",
      heatCapacity: 5,
      config: {},
      division: { id: "div1", heatCapacity: 10 },
    });

    await startRoundDrawing("round1", "RANDOM");
    const onApplied = transitionRoundMock.mock.calls[0][2].onApplied;
    await onApplied({}, { userId: "u1" });

    expect(formDrawInTxMock.mock.calls[0][1].heatCapacity).toBe(5);
  });
});
