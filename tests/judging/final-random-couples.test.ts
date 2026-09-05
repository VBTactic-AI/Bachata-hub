import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Actor } from "@/server/rbac/actor";

const requirePermissionMock = vi.fn();
vi.mock("@/server/rbac/authorize", () => ({ requirePermission: (...a: unknown[]) => requirePermissionMock(...a) }));

const getRoundEligiblePoolMock = vi.fn();
// FLOW-005: mulberry32 остаётся настоящим (не мокается) — иначе тест не
// проверял бы то единственное, что здесь имеет значение: seed реально
// воспроизводит выбор пары через тот же PRNG, что и Draw Engine.
vi.mock("@/server/competition/draw-engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/competition/draw-engine")>();
  return { ...actual, getRoundEligiblePool: (...a: unknown[]) => getRoundEligiblePoolMock(...a) };
});

const transitionHeatMock = vi.fn();
vi.mock("@/server/state/heat-state", () => ({ transitionHeat: (...a: unknown[]) => transitionHeatMock(...a) }));

const roundFindUniqueOrThrow = vi.fn();
const txHeatFindFirst = vi.fn();
const txHeatUpdateMany = vi.fn();
const txHeatCreate = vi.fn();
const txDrawCreate = vi.fn();
const txDrawParticipantCreateMany = vi.fn();
const txFinalPairCreate = vi.fn();
const auditCreate = vi.fn();

const fakeTx = {
  heat: { findFirst: txHeatFindFirst, updateMany: txHeatUpdateMany, create: txHeatCreate },
  draw: { create: txDrawCreate },
  drawParticipant: { createMany: txDrawParticipantCreateMany },
  finalPair: { create: txFinalPairCreate },
  auditLog: { create: auditCreate },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    round: { findUniqueOrThrow: (...a: unknown[]) => roundFindUniqueOrThrow(...a) },
    $transaction: (fn: (tx: typeof fakeTx) => unknown) => fn(fakeTx),
  },
}));

const { advanceRandomCouples } = await import("@/server/judging/final-random-couples");
const { mulberry32 } = await import("@/server/competition/draw-engine");
const { ValidationFailedError } = await import("@/server/errors");

const actor: Actor = { userId: "admin1", email: "a@b.by", globalPermissions: new Set(), permissionsByCompetition: new Map() };

const baseRound = {
  id: "final1",
  order: 5,
  divisionId: "div1",
  status: "RUNNING",
  division: { id: "div1", competitionId: "comp1" },
  finalSession: { id: "session1", format: "RANDOM_COUPLES", pairs: [] as { leaderRegistrationId: string; followerRegistrationId: string }[] },
  heats: [] as { id: string; number: number; status: string; statusVersion: number }[],
};

beforeEach(() => {
  requirePermissionMock.mockReset().mockResolvedValue(actor);
  // Пул из ровно одного человека каждой роли — детерминирует случайный
  // выбор для тестов, не завязываясь на реализацию crypto.randomInt.
  getRoundEligiblePoolMock.mockReset().mockResolvedValue(new Set(["reg-leader-1"]));
  transitionHeatMock.mockReset().mockResolvedValue(undefined);
  roundFindUniqueOrThrow.mockReset().mockResolvedValue(baseRound);
  txHeatFindFirst.mockReset().mockResolvedValue(null);
  txHeatUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  txHeatCreate.mockReset().mockResolvedValue({ id: "heat1" });
  txDrawCreate.mockReset().mockResolvedValue({ id: "draw1" });
  txDrawParticipantCreateMany.mockReset();
  txFinalPairCreate.mockReset();
  auditCreate.mockReset();
});

// getRoundEligiblePool вызывается дважды (LEADER, потом FOLLOWER) — второй
// вызов должен вернуть пул ведомых.
function mockPools(leaders: string[], followers: string[]) {
  getRoundEligiblePoolMock.mockReset();
  getRoundEligiblePoolMock.mockImplementationOnce(async () => new Set(leaders));
  getRoundEligiblePoolMock.mockImplementationOnce(async () => new Set(followers));
}

describe("advanceRandomCouples()", () => {
  it("отклоняет для раунда не RANDOM_COUPLES", async () => {
    roundFindUniqueOrThrow.mockResolvedValue({ ...baseRound, finalSession: { ...baseRound.finalSession, format: "NORMAL" } });
    await expect(advanceRandomCouples("final1")).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it("отклоняет, если финал уже завершён", async () => {
    roundFindUniqueOrThrow.mockResolvedValue({ ...baseRound, status: "COMPLETED" });
    await expect(advanceRandomCouples("final1")).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it("первая пара: создаёт заход с ровно одним ведущим и одной ведомой, сохраняет FinalPair с seed", async () => {
    mockPools(["reg-leader-1"], ["reg-follower-1"]);

    const result = await advanceRandomCouples("final1", "Bachata Rosa");

    expect(result).toEqual({ pairNumber: 1 });
    expect(txHeatCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ roundId: "final1", number: 1, status: "RUNNING" }) }));
    expect(txDrawParticipantCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({ registrationId: "reg-leader-1", role: "LEADER", scored: true }),
          expect.objectContaining({ registrationId: "reg-follower-1", role: "FOLLOWER", scored: true }),
        ],
      })
    );
    const pairData = txFinalPairCreate.mock.calls[0][0].data;
    expect(pairData.leaderRegistrationId).toBe("reg-leader-1");
    expect(pairData.followerRegistrationId).toBe("reg-follower-1");
    expect(pairData.trackName).toBe("Bachata Rosa");
    expect(typeof pairData.seed).toBe("string");
    expect(pairData.seed.length).toBeGreaterThan(0);
    expect(txHeatUpdateMany).not.toHaveBeenCalled(); // не было предыдущей пары для завершения
  });

  // FLOW-005: раньше seed сохранялся, но не влиял на сам выбор
  // (crypto.randomInt отдельно) — реплей seed'а не воспроизводил бы пару.
  // Теперь выбор идёт через mulberry32(seed) — тот же PRNG, что и Draw Engine.
  it("сохранённый seed реально воспроизводит выбор пары (не декоративный)", async () => {
    mockPools(["L1", "L2", "L3"], ["F1", "F2", "F3"]);

    await advanceRandomCouples("final1");

    const pairData = txFinalPairCreate.mock.calls[0][0].data;
    const rng = mulberry32(parseInt((pairData.seed as string).slice(0, 8), 16));
    const replayedLeader = ["L1", "L2", "L3"][Math.floor(rng() * 3)];
    const replayedFollower = ["F1", "F2", "F3"][Math.floor(rng() * 3)];
    expect(replayedLeader).toBe(pairData.leaderRegistrationId);
    expect(replayedFollower).toBe(pairData.followerRegistrationId);
  });

  it("отклоняет первую пару, если на паркете уже идёт другой заход соревнования (A4)", async () => {
    mockPools(["reg-leader-1"], ["reg-follower-1"]);
    txHeatFindFirst.mockResolvedValue({ id: "other-heat" });
    await expect(advanceRandomCouples("final1")).rejects.toBeInstanceOf(ValidationFailedError);
    expect(txHeatCreate).not.toHaveBeenCalled();
  });

  it("следующая пара: завершает текущий заход И создаёт новый в одной транзакции, исключая уже станцевавших", async () => {
    roundFindUniqueOrThrow.mockResolvedValue({
      ...baseRound,
      finalSession: { id: "session1", format: "RANDOM_COUPLES", pairs: [{ leaderRegistrationId: "reg-leader-1", followerRegistrationId: "reg-follower-1" }] },
      heats: [{ id: "heat1", number: 1, status: "RUNNING", statusVersion: 1 }],
    });
    mockPools(["reg-leader-1", "reg-leader-2"], ["reg-follower-1", "reg-follower-2"]);

    const result = await advanceRandomCouples("final1");

    expect(result).toEqual({ pairNumber: 2 });
    expect(txHeatUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "heat1", statusVersion: 1 }, data: expect.objectContaining({ status: "FINISHED" }) })
    );
    expect(transitionHeatMock).not.toHaveBeenCalled(); // не через обычный transitionHeat — атомарно со следующей парой
    const pairData = txFinalPairCreate.mock.calls[0][0].data;
    expect(pairData.pairNumber).toBe(2);
    // Уже станцевавшие (reg-leader-1/reg-follower-1) исключены из выбора.
    expect(pairData.leaderRegistrationId).toBe("reg-leader-2");
    expect(pairData.followerRegistrationId).toBe("reg-follower-2");
  });

  it("последняя пара станцевала, участников для новой пары не осталось -> завершает заход через обычный transitionHeat", async () => {
    roundFindUniqueOrThrow.mockResolvedValue({
      ...baseRound,
      finalSession: { id: "session1", format: "RANDOM_COUPLES", pairs: [{ leaderRegistrationId: "reg-leader-1", followerRegistrationId: "reg-follower-1" }] },
      heats: [{ id: "heat1", number: 1, status: "RUNNING", statusVersion: 1 }],
    });
    mockPools([], []); // пул исчерпан с обеих сторон

    const result = await advanceRandomCouples("final1");

    expect(result).toEqual({ pairNumber: null });
    expect(transitionHeatMock).toHaveBeenCalledWith("heat1", "FINISHED", expect.objectContaining({ reason: expect.any(String) }));
    expect(txHeatCreate).not.toHaveBeenCalled();
    expect(txFinalPairCreate).not.toHaveBeenCalled();
  });

  it("отклоняет, если пар для формирования больше нет и танцевать сейчас некому (нет незавершённого захода)", async () => {
    roundFindUniqueOrThrow.mockResolvedValue({
      ...baseRound,
      status: "SCORING",
      finalSession: { id: "session1", format: "RANDOM_COUPLES", pairs: [{ leaderRegistrationId: "reg-leader-1", followerRegistrationId: "reg-follower-1" }] },
      heats: [{ id: "heat1", number: 1, status: "FINISHED", statusVersion: 2 }],
    });
    mockPools([], []);
    await expect(advanceRandomCouples("final1")).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it("гонка: заход текущей пары уже изменён кем-то другим — отклоняет", async () => {
    roundFindUniqueOrThrow.mockResolvedValue({
      ...baseRound,
      finalSession: { id: "session1", format: "RANDOM_COUPLES", pairs: [{ leaderRegistrationId: "reg-leader-1", followerRegistrationId: "reg-follower-1" }] },
      heats: [{ id: "heat1", number: 1, status: "RUNNING", statusVersion: 1 }],
    });
    mockPools(["reg-leader-2"], ["reg-follower-2"]);
    txHeatUpdateMany.mockResolvedValue({ count: 0 });
    await expect(advanceRandomCouples("final1")).rejects.toBeInstanceOf(ValidationFailedError);
  });
});
