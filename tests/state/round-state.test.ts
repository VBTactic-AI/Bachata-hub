import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Actor } from "@/server/rbac/actor";

const requirePermissionMock = vi.fn();
vi.mock("@/server/rbac/authorize", () => ({ requirePermission: (...a: unknown[]) => requirePermissionMock(...a) }));

const roundFindUniqueOrThrow = vi.fn();
const txRoundFindFirst = vi.fn();
const txRoundUpdateMany = vi.fn();
const txHeatFindFirst = vi.fn();
const auditCreate = vi.fn();

const fakeTx = {
  round: { findFirst: txRoundFindFirst, updateMany: txRoundUpdateMany },
  heat: { findFirst: txHeatFindFirst },
  auditLog: { create: auditCreate },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    round: { findUniqueOrThrow: (...a: unknown[]) => roundFindUniqueOrThrow(...a) },
    $transaction: (fn: (tx: typeof fakeTx) => unknown) => fn(fakeTx),
  },
}));

const { transitionRound } = await import("@/server/state/round-state");
const { ValidationFailedError } = await import("@/server/errors");

const actor: Actor = { userId: "u1", email: "a@b.by", globalPermissions: new Set(), permissionsByCompetition: new Map() };

beforeEach(() => {
  requirePermissionMock.mockReset().mockResolvedValue(actor);
  roundFindUniqueOrThrow.mockReset().mockResolvedValue({
    id: "round2",
    order: 2,
    status: "DRAW_LOCKED",
    statusVersion: 1,
    division: { id: "div1", competitionId: "comp1" },
  });
  txRoundFindFirst.mockReset().mockResolvedValue(null);
  txRoundUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  txHeatFindFirst.mockReset().mockResolvedValue(null);
  auditCreate.mockReset();
});

describe("transitionRound() — DRAWING только через отдельное действие", () => {
  beforeEach(() => {
    roundFindUniqueOrThrow.mockResolvedValue({
      id: "round1",
      order: 1,
      status: "READY",
      statusVersion: 1,
      division: { id: "div1", competitionId: "comp1" },
    });
  });

  it("отклоняет прямой переход в DRAWING без extraData (без выбора порядка вызова)", async () => {
    await expect(transitionRound("round1", "DRAWING")).rejects.toBeInstanceOf(ValidationFailedError);
    expect(txRoundUpdateMany).not.toHaveBeenCalled();
  });

  it("проверяет право draw:generate для перехода в DRAWING", async () => {
    await transitionRound("round1", "DRAWING", { extraData: { config: { drawCallOrder: "RANDOM" } } });
    expect(requirePermissionMock).toHaveBeenCalledWith("draw:generate", "comp1");
  });

  it("разрешает переход в DRAWING с extraData и вызывает onApplied той же транзакцией", async () => {
    const onApplied = vi.fn();

    await transitionRound("round1", "DRAWING", {
      extraData: { config: { drawCallOrder: "SEQUENTIAL" } },
      onApplied,
    });

    expect(txRoundUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ config: { drawCallOrder: "SEQUENTIAL" } }) })
    );
    expect(onApplied).toHaveBeenCalledWith(fakeTx, actor);
  });

  it("не вызывает onApplied, если обновление проиграло гонку (updatedCount = 0)", async () => {
    txRoundUpdateMany.mockResolvedValue({ count: 0 });
    const onApplied = vi.fn();

    await expect(
      transitionRound("round1", "DRAWING", { extraData: { config: {} }, onApplied })
    ).rejects.toThrow();
    expect(onApplied).not.toHaveBeenCalled();
  });
});

describe("transitionRound() — DRAW_LOCKED требует список у каждого заезда", () => {
  beforeEach(() => {
    roundFindUniqueOrThrow.mockResolvedValue({
      id: "round1",
      order: 1,
      status: "DRAWING",
      statusVersion: 1,
      division: { id: "div1", competitionId: "comp1" },
    });
  });

  it("проверяет право draw:lock", async () => {
    await transitionRound("round1", "DRAW_LOCKED");
    expect(requirePermissionMock).toHaveBeenCalledWith("draw:lock", "comp1");
  });

  it("отклоняет, если у какого-то заезда раунда нет ни одной жеребьёвки", async () => {
    txHeatFindFirst.mockResolvedValue({ id: "heat3", number: 3 });

    await expect(transitionRound("round1", "DRAW_LOCKED")).rejects.toBeInstanceOf(ValidationFailedError);
    expect(txRoundUpdateMany).not.toHaveBeenCalled();
  });

  it("разрешает, если у всех заездов раунда есть жеребьёвка", async () => {
    txHeatFindFirst.mockResolvedValue(null);

    await transitionRound("round1", "DRAW_LOCKED");

    expect(txHeatFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { roundId: "round1", draws: { none: {} } } })
    );
    expect(txRoundUpdateMany).toHaveBeenCalledOnce();
  });
});

// Раунды одного дивизиона запускаются строго по очереди — нельзя начать
// финал, не проведя отборочный (docs/00_DECISIONS.md, A8).
describe("transitionRound() — раунды дивизиона по очереди", () => {
  it("запускает раунд, если все более ранние раунды дивизиона уже COMPLETED", async () => {
    txRoundFindFirst.mockResolvedValue(null);

    await transitionRound("round2", "RUNNING");

    expect(txRoundFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { divisionId: "div1", order: { lt: 2 }, status: { not: "COMPLETED" } },
      })
    );
    expect(txRoundUpdateMany).toHaveBeenCalledOnce();
  });

  it("отклоняет запуск, если более ранний раунд дивизиона ещё не COMPLETED", async () => {
    txRoundFindFirst.mockResolvedValue({ id: "round1", order: 1, type: null, stage: { name: "Отборочный" } });

    await expect(transitionRound("round2", "RUNNING")).rejects.toBeInstanceOf(ValidationFailedError);
    expect(txRoundUpdateMany).not.toHaveBeenCalled();
  });

  it("не проверяет очередь для переходов, отличных от RUNNING", async () => {
    roundFindUniqueOrThrow.mockResolvedValue({
      id: "round2",
      order: 2,
      status: "RUNNING",
      statusVersion: 1,
      division: { id: "div1", competitionId: "comp1" },
    });

    await transitionRound("round2", "PAUSED");

    expect(txRoundFindFirst).not.toHaveBeenCalled();
    expect(txRoundUpdateMany).toHaveBeenCalledOnce();
  });

  it("не смотрит на раунды ДРУГИХ дивизионов", async () => {
    await transitionRound("round2", "RUNNING");

    const whereArg = txRoundFindFirst.mock.calls[0][0].where;
    expect(whereArg.divisionId).toBe("div1");
  });
});
