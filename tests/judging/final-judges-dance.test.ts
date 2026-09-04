import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Actor } from "@/server/rbac/actor";

const requirePermissionMock = vi.fn();
vi.mock("@/server/rbac/authorize", () => ({ requirePermission: (...a: unknown[]) => requirePermissionMock(...a) }));

const getRoundEligiblePoolMock = vi.fn();
vi.mock("@/server/competition/draw-engine", () => ({ getRoundEligiblePool: (...a: unknown[]) => getRoundEligiblePoolMock(...a) }));

const transitionHeatMock = vi.fn();
vi.mock("@/server/state/heat-state", () => ({ transitionHeat: (...a: unknown[]) => transitionHeatMock(...a) }));

const roundFindUniqueOrThrow = vi.fn();
const txHeatFindFirst = vi.fn();
const txHeatUpdateMany = vi.fn();
const txHeatCreate = vi.fn();
const txDrawCreate = vi.fn();
const txDrawParticipantCreateMany = vi.fn();
const txRegistrationFindMany = vi.fn();
const txFinalSessionUpdate = vi.fn();
const auditCreate = vi.fn();

const fakeTx = {
  heat: { findFirst: txHeatFindFirst, updateMany: txHeatUpdateMany, create: txHeatCreate },
  draw: { create: txDrawCreate },
  drawParticipant: { createMany: txDrawParticipantCreateMany },
  registration: { findMany: txRegistrationFindMany },
  finalSession: { update: txFinalSessionUpdate },
  auditLog: { create: auditCreate },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    round: { findUniqueOrThrow: (...a: unknown[]) => roundFindUniqueOrThrow(...a) },
    $transaction: (fn: (tx: typeof fakeTx) => unknown) => fn(fakeTx),
  },
}));

const { advanceJudgesDanceStage } = await import("@/server/judging/final-judges-dance");
const { ValidationFailedError } = await import("@/server/errors");

const actor: Actor = { userId: "admin1", email: "a@b.by", globalPermissions: new Set(), permissionsByCompetition: new Map() };

const baseRound = {
  id: "final1",
  order: 5,
  divisionId: "div1",
  status: "RUNNING",
  division: { id: "div1", competitionId: "comp1" },
  finalSession: { id: "session1", format: "JUDGES_DANCE", currentStage: null as number | null },
  heats: [] as { id: string; number: number; status: string; statusVersion: number }[],
};

beforeEach(() => {
  requirePermissionMock.mockReset().mockResolvedValue(actor);
  getRoundEligiblePoolMock.mockReset().mockResolvedValue(new Set(["reg1", "reg2"]));
  transitionHeatMock.mockReset().mockResolvedValue(undefined);
  roundFindUniqueOrThrow.mockReset().mockResolvedValue(baseRound);
  txHeatFindFirst.mockReset().mockResolvedValue(null);
  txHeatUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  txHeatCreate.mockReset().mockResolvedValue({ id: "heat1" });
  txDrawCreate.mockReset().mockResolvedValue({ id: "draw1" });
  txDrawParticipantCreateMany.mockReset();
  txRegistrationFindMany.mockReset().mockResolvedValue([
    { id: "reg1", checkIn: { bibNumber: "1" } },
    { id: "reg2", checkIn: { bibNumber: "2" } },
  ]);
  txFinalSessionUpdate.mockReset();
  auditCreate.mockReset();
});

describe("advanceJudgesDanceStage()", () => {
  it("отклоняет для раунда не JUDGES_DANCE", async () => {
    roundFindUniqueOrThrow.mockResolvedValue({ ...baseRound, finalSession: { ...baseRound.finalSession, format: "NORMAL" } });
    await expect(advanceJudgesDanceStage("final1")).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it("отклоняет, если финал уже завершён", async () => {
    roundFindUniqueOrThrow.mockResolvedValue({ ...baseRound, status: "COMPLETED" });
    await expect(advanceJudgesDanceStage("final1")).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it("currentStage=null -> создаёт заход стадии 1 (LEADER), не трогая другие заходы", async () => {
    const result = await advanceJudgesDanceStage("final1");
    expect(result).toEqual({ stage: 1 });
    expect(getRoundEligiblePoolMock).toHaveBeenCalledWith(fakeTx, { divisionId: "div1", roundOrder: 5, role: "LEADER" });
    expect(txHeatCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ roundId: "final1", number: 1, status: "RUNNING" }) }));
    expect(txDrawParticipantCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({ registrationId: "reg1", role: "LEADER", calledOrder: 1, scored: true }),
          expect.objectContaining({ registrationId: "reg2", role: "LEADER", calledOrder: 2, scored: true }),
        ],
      })
    );
    expect(txFinalSessionUpdate).toHaveBeenCalledWith({ where: { id: "session1" }, data: { currentStage: 1 } });
    expect(txHeatUpdateMany).not.toHaveBeenCalled(); // ничего не завершаем на этом шаге
  });

  it("отклоняет старт стадии 1, если на паркете уже идёт другой заход соревнования (A4)", async () => {
    txHeatFindFirst.mockResolvedValue({ id: "other-heat" });
    await expect(advanceJudgesDanceStage("final1")).rejects.toBeInstanceOf(ValidationFailedError);
    expect(txHeatCreate).not.toHaveBeenCalled();
  });

  it("currentStage=1 -> завершает заход стадии 1 И создаёт заход стадии 2 (FOLLOWER) в ОДНОЙ транзакции", async () => {
    roundFindUniqueOrThrow.mockResolvedValue({
      ...baseRound,
      finalSession: { id: "session1", format: "JUDGES_DANCE", currentStage: 1 },
      heats: [{ id: "heat1", number: 1, status: "RUNNING", statusVersion: 1 }],
    });

    const result = await advanceJudgesDanceStage("final1");

    expect(result).toEqual({ stage: 2 });
    // Заход стадии 1 завершён напрямую (не через transitionHeat — иначе
    // autoAdvanceRoundIfAllHeatsFinishedInTx решил бы, что раунд закончен).
    expect(txHeatUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "heat1", statusVersion: 1 }, data: expect.objectContaining({ status: "FINISHED" }) })
    );
    expect(transitionHeatMock).not.toHaveBeenCalled();
    // Заход стадии 2 — для роли FOLLOWER.
    expect(getRoundEligiblePoolMock).toHaveBeenCalledWith(fakeTx, { divisionId: "div1", roundOrder: 5, role: "FOLLOWER" });
    expect(txHeatCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ number: 2, status: "RUNNING" }) }));
    expect(txFinalSessionUpdate).toHaveBeenCalledWith({ where: { id: "session1" }, data: { currentStage: 2 } });
  });

  it("currentStage=1, но заход стадии 1 уже изменён кем-то другим (гонка) — отклоняет", async () => {
    roundFindUniqueOrThrow.mockResolvedValue({
      ...baseRound,
      finalSession: { id: "session1", format: "JUDGES_DANCE", currentStage: 1 },
      heats: [{ id: "heat1", number: 1, status: "RUNNING", statusVersion: 1 }],
    });
    txHeatUpdateMany.mockResolvedValue({ count: 0 });
    await expect(advanceJudgesDanceStage("final1")).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it("currentStage=2 -> завершает заход стадии 2 через обычный transitionHeat (переиспользует автозавершение раунда)", async () => {
    roundFindUniqueOrThrow.mockResolvedValue({
      ...baseRound,
      finalSession: { id: "session1", format: "JUDGES_DANCE", currentStage: 2 },
      heats: [
        { id: "heat1", number: 1, status: "FINISHED", statusVersion: 2 },
        { id: "heat2", number: 2, status: "RUNNING", statusVersion: 1 },
      ],
    });

    const result = await advanceJudgesDanceStage("final1");

    expect(result).toEqual({ stage: null });
    expect(transitionHeatMock).toHaveBeenCalledWith("heat2", "FINISHED", expect.objectContaining({ reason: expect.any(String) }));
    expect(txHeatCreate).not.toHaveBeenCalled();
  });
});
