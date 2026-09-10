import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Actor } from "@/server/rbac/actor";

const requirePermissionMock = vi.fn();
vi.mock("@/server/rbac/authorize", () => ({ requirePermission: (...a: unknown[]) => requirePermissionMock(...a) }));

const transitionRoundMock = vi.fn();
vi.mock("@/server/state/round-state", () => ({ transitionRound: (...a: unknown[]) => transitionRoundMock(...a) }));

const roundFindUniqueOrThrow = vi.fn();
const roundCount = vi.fn();
const roundFindFirst = vi.fn(); // advancedRegistrationIdsFromPreviousRound
const roundResultFindMany = vi.fn();
const heatFindUniqueOrThrow = vi.fn();
const heatFindMany = vi.fn(); // allRoundParticipantIds
const heatCount = vi.fn();
const registrationFindUniqueOrThrow = vi.fn();
const registrationFindMany = vi.fn();
const drawParticipantFindUniqueOrThrow = vi.fn();
const txDrawCreate = vi.fn();
const txDrawParticipantAggregate = vi.fn();
const txDrawParticipantCreate = vi.fn();
const txDrawParticipantDelete = vi.fn();
const auditCreate = vi.fn();

const fakeTx = {
  draw: { create: txDrawCreate },
  drawParticipant: { aggregate: txDrawParticipantAggregate, create: txDrawParticipantCreate, delete: txDrawParticipantDelete },
  auditLog: { create: auditCreate },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    round: {
      findUniqueOrThrow: (...a: unknown[]) => roundFindUniqueOrThrow(...a),
      count: (...a: unknown[]) => roundCount(...a),
      findFirst: (...a: unknown[]) => roundFindFirst(...a),
    },
    roundResult: { findMany: (...a: unknown[]) => roundResultFindMany(...a) },
    heat: {
      findFirstOrThrow: (...a: unknown[]) => heatFindUniqueOrThrow(...a),
      findMany: (...a: unknown[]) => heatFindMany(...a),
      count: (...a: unknown[]) => heatCount(...a),
    },
    registration: {
      findUniqueOrThrow: (...a: unknown[]) => registrationFindUniqueOrThrow(...a),
      findMany: (...a: unknown[]) => registrationFindMany(...a),
    },
    drawParticipant: { findFirstOrThrow: (...a: unknown[]) => drawParticipantFindUniqueOrThrow(...a) },
    $transaction: (fn: (tx: typeof fakeTx) => unknown) => fn(fakeTx),
  },
}));

const { startRoundManually, listRealCandidates, addRealParticipant, removeRealParticipant, MANUAL_DRAW_ALGORITHM_VERSION } =
  await import("@/server/competition/draw-manual");
const { ValidationFailedError } = await import("@/server/errors");

const actor: Actor = { userId: "u1", email: "a@b.by", globalPermissions: new Set(), permissionsByCompetition: new Map() };

function reg(id: string, bib: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    divisionId: "div1",
    role: "LEADER",
    status: "REGISTERED",
    checkIn: { status: "CHECKED_IN", bibNumber: bib },
    dancer: { displayName: `Танцор ${id}` },
    ...overrides,
  };
}

beforeEach(() => {
  requirePermissionMock.mockReset().mockResolvedValue(actor);
  transitionRoundMock.mockReset().mockResolvedValue(undefined);
  roundFindUniqueOrThrow.mockReset().mockResolvedValue({
    id: "round1",
    divisionId: "div1",
    order: 1,
    type: null,
    status: "READY",
    config: {},
    finalSession: null,
  });
  roundCount.mockReset().mockResolvedValue(1); // isFinalStageInTx: есть более поздний раунд -> не финал
  roundFindFirst.mockReset().mockResolvedValue(null); // нет предыдущего раунда — пул не ограничен
  roundResultFindMany.mockReset().mockResolvedValue([]);
  heatCount.mockReset().mockResolvedValue(1);
  heatFindMany.mockReset().mockResolvedValue([]); // allRoundParticipantIds: никто ещё не занят
  heatFindUniqueOrThrow.mockReset().mockResolvedValue({
    id: "heat1",
    roundId: "round1",
    status: "PENDING",
    round: {
      status: "DRAWING",
      divisionId: "div1",
      order: 1,
      heatCapacity: 8,
      division: { id: "div1", competitionId: "comp1", heatCapacity: 8 },
    },
    draws: [],
  });
  registrationFindUniqueOrThrow.mockReset().mockResolvedValue(reg("r1", "5"));
  // По умолчанию: если ищут по id (список деталей кандидатов) — вернуть их;
  // если по divisionId/role/checkIn (пул раунда) — вернуть один и тот же
  // список из 3 человек.
  registrationFindMany.mockReset().mockImplementation((args: { where: { id?: { in: string[] }; divisionId?: string } }) => {
    if (args.where.id) {
      return Promise.resolve([reg("r1", "5"), reg("r2", "6"), reg("r3", "7")].filter((r) => args.where.id!.in.includes(r.id)));
    }
    return Promise.resolve([reg("r1", "5"), reg("r2", "6"), reg("r3", "7")]);
  });
  drawParticipantFindUniqueOrThrow.mockReset();
  txDrawCreate.mockReset().mockResolvedValue({ id: "draw1", version: 1 });
  txDrawParticipantAggregate.mockReset().mockResolvedValue({ _max: { calledOrder: 0 } });
  txDrawParticipantCreate.mockReset().mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: "dp1", ...data }));
  txDrawParticipantDelete.mockReset().mockResolvedValue({});
  auditCreate.mockReset();
});

describe("startRoundManually()", () => {
  it("переводит раунд READY -> DRAWING без auto-формирования (не вызывает formDrawInTx)", async () => {
    await startRoundManually("round1");
    expect(transitionRoundMock).toHaveBeenCalledWith(
      "round1",
      "DRAWING",
      expect.objectContaining({ extraData: { config: { manualDraw: true } } })
    );
  });

  it("отклоняет, если в раунде нет ни одного захода", async () => {
    heatCount.mockResolvedValue(0);
    await expect(startRoundManually("round1")).rejects.toBeInstanceOf(ValidationFailedError);
    expect(transitionRoundMock).not.toHaveBeenCalled();
  });

  it("отклоняет для финального раунда без начатого финала (тот же гейт, что и у автожеребьёвки)", async () => {
    roundCount.mockResolvedValue(0); // нет более позднего обычного раунда -> это финал
    await expect(startRoundManually("round1")).rejects.toBeInstanceOf(ValidationFailedError);
    expect(transitionRoundMock).not.toHaveBeenCalled();
  });

  it("сохраняет уже существующие поля Round.config", async () => {
    roundFindUniqueOrThrow.mockResolvedValue({
      id: "round1",
      divisionId: "div1",
      order: 1,
      type: null,
      status: "READY",
      config: { someFlag: true },
      finalSession: null,
    });
    await startRoundManually("round1");
    expect(transitionRoundMock).toHaveBeenCalledWith(
      "round1",
      "DRAWING",
      expect.objectContaining({ extraData: { config: { someFlag: true, manualDraw: true } } })
    );
  });
});

describe("listRealCandidates()", () => {
  it("возвращает пул раунда, кроме уже занятых кем-либо в этом раунде", async () => {
    heatFindMany.mockResolvedValue([{ draws: [{ participants: [{ registrationId: "r2" }] }] }]); // r2 уже где-то в раунде

    const result = await listRealCandidates("heat1", "LEADER");

    expect(result.registrations.map((r) => r.id)).toEqual(["r1", "r3"]);
    expect(result.remainingSlots).toBe(8); // heatCapacity=8, в заходе пока никого
  });

  it("считает remainingSlots по вместимости минус уже вызванные (включая помощников) этой роли", async () => {
    heatFindUniqueOrThrow.mockResolvedValue({
      id: "heat1",
      roundId: "round1",
      status: "PENDING",
      round: { status: "DRAWING", divisionId: "div1", order: 1, heatCapacity: 8, division: { id: "div1", competitionId: "comp1", heatCapacity: 8 } },
      draws: [{ participants: [{ role: "LEADER" }, { role: "LEADER" }, { role: "FOLLOWER" }] }],
    });

    const result = await listRealCandidates("heat1", "LEADER");
    expect(result.remainingSlots).toBe(6); // 8 - 2 уже вызванных партнёров
  });

  it("проверяет право draw:override", async () => {
    await listRealCandidates("heat1", "LEADER");
    expect(requirePermissionMock).toHaveBeenCalledWith("draw:override", "comp1");
  });
});

describe("addRealParticipant()", () => {
  it("создаёт Draw версии 1 и добавляет участника, если захода ещё не было", async () => {
    const result = await addRealParticipant("heat1", "r1", "LEADER");

    expect(txDrawCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ heatId: "heat1", version: 1, algorithmVersion: MANUAL_DRAW_ALGORITHM_VERSION }) })
    );
    expect(txDrawParticipantCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ registrationId: "r1", role: "LEADER", scored: true, calledOrder: 1 }) })
    );
    expect(auditCreate).toHaveBeenCalledTimes(2); // draw.create + draw_participant.add_manual
    expect(result.id).toBe("dp1");
  });

  it("переиспользует уже существующий Draw, не создаёт версию 2", async () => {
    heatFindUniqueOrThrow.mockResolvedValue({
      id: "heat1",
      roundId: "round1",
      status: "PENDING",
      round: { status: "DRAWING", divisionId: "div1", order: 1, heatCapacity: 8, division: { id: "div1", competitionId: "comp1", heatCapacity: 8 } },
      draws: [{ id: "existing-draw", participants: [] }],
    });

    await addRealParticipant("heat1", "r1", "LEADER");

    expect(txDrawCreate).not.toHaveBeenCalled();
    expect(txDrawParticipantCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ drawId: "existing-draw" }) }));
  });

  it("отклоняет, если раунд не в статусе DRAWING", async () => {
    heatFindUniqueOrThrow.mockResolvedValue({
      id: "heat1",
      roundId: "round1",
      status: "PENDING",
      round: { status: "READY", divisionId: "div1", order: 1, heatCapacity: 8, division: { id: "div1", competitionId: "comp1", heatCapacity: 8 } },
      draws: [],
    });
    await expect(addRealParticipant("heat1", "r1", "LEADER")).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it("отклоняет участника из чужой категории", async () => {
    registrationFindUniqueOrThrow.mockResolvedValue(reg("r-other", "9", { divisionId: "div-other" }));
    await expect(addRealParticipant("heat1", "r-other", "LEADER")).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it("отклоняет несовпадение роли", async () => {
    registrationFindUniqueOrThrow.mockResolvedValue(reg("r1", "5", { role: "FOLLOWER" }));
    await expect(addRealParticipant("heat1", "r1", "LEADER")).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it("отклоняет, если участник не прошёл check-in", async () => {
    registrationFindUniqueOrThrow.mockResolvedValue(reg("r1", "5", { checkIn: null }));
    await expect(addRealParticipant("heat1", "r1", "LEADER")).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it("отклоняет, если участник не входит в пул раунда (не прошёл предыдущий раунд, A9)", async () => {
    registrationFindMany.mockImplementation(() => Promise.resolve([])); // пул раунда пуст
    await expect(addRealParticipant("heat1", "r1", "LEADER")).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it("отклоняет, если участник уже в каком-то заходе этого раунда", async () => {
    heatFindMany.mockResolvedValue([{ draws: [{ participants: [{ registrationId: "r1" }] }] }]);
    await expect(addRealParticipant("heat1", "r1", "LEADER")).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it("не даёт превысить вместимость захода по роли", async () => {
    heatFindUniqueOrThrow.mockResolvedValue({
      id: "heat1",
      roundId: "round1",
      status: "PENDING",
      round: { status: "DRAWING", divisionId: "div1", order: 1, heatCapacity: 2, division: { id: "div1", competitionId: "comp1", heatCapacity: 2 } },
      draws: [{ id: "existing-draw", participants: [{ role: "LEADER" }, { role: "LEADER" }] }], // уже 2 из 2
    });
    await expect(addRealParticipant("heat1", "r1", "LEADER")).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it("отклоняет, если заход уже запущен", async () => {
    heatFindUniqueOrThrow.mockResolvedValue({
      id: "heat1",
      roundId: "round1",
      status: "RUNNING",
      round: { status: "DRAWING", divisionId: "div1", order: 1, heatCapacity: 8, division: { id: "div1", competitionId: "comp1", heatCapacity: 8 } },
      draws: [],
    });
    await expect(addRealParticipant("heat1", "r1", "LEADER")).rejects.toBeInstanceOf(ValidationFailedError);
  });
});

describe("removeRealParticipant()", () => {
  function baseParticipant(overrides: Record<string, unknown> = {}) {
    return {
      id: "dp1",
      registrationId: "r1",
      role: "LEADER",
      helperSource: null,
      draw: {
        heat: {
          status: "PENDING",
          round: { status: "DRAWING", division: { competitionId: "comp1" } },
        },
      },
      ...overrides,
    };
  }

  it("удаляет реального участника и пишет audit", async () => {
    drawParticipantFindUniqueOrThrow.mockResolvedValue(baseParticipant());
    await removeRealParticipant("dp1");
    expect(txDrawParticipantDelete).toHaveBeenCalledWith({ where: { id: "dp1" } });
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "draw_participant.remove_manual" }) })
    );
  });

  it("отклоняет, если это помощник — направляет к другой кнопке", async () => {
    drawParticipantFindUniqueOrThrow.mockResolvedValue(baseParticipant({ helperSource: "GUEST_HIGHER_CATEGORY" }));
    await expect(removeRealParticipant("dp1")).rejects.toBeInstanceOf(ValidationFailedError);
    expect(txDrawParticipantDelete).not.toHaveBeenCalled();
  });

  it("отклоняет, если заход уже запущен", async () => {
    drawParticipantFindUniqueOrThrow.mockResolvedValue(
      baseParticipant({ draw: { heat: { status: "RUNNING", round: { status: "DRAWING", division: { competitionId: "comp1" } } } } })
    );
    await expect(removeRealParticipant("dp1")).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it("отклоняет, если раунд уже не в DRAWING", async () => {
    drawParticipantFindUniqueOrThrow.mockResolvedValue(
      baseParticipant({ draw: { heat: { status: "PENDING", round: { status: "DRAW_LOCKED", division: { competitionId: "comp1" } } } } })
    );
    await expect(removeRealParticipant("dp1")).rejects.toBeInstanceOf(ValidationFailedError);
  });
});
