import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Actor } from "@/server/rbac/actor";

const requirePermissionMock = vi.fn();
vi.mock("@/server/rbac/authorize", () => ({ requirePermission: (...a: unknown[]) => requirePermissionMock(...a) }));

const heatFindUniqueOrThrow = vi.fn();
const registrationFindUniqueOrThrow = vi.fn();
const registrationFindMany = vi.fn();
const divisionFindMany = vi.fn();
const drawParticipantFindFirst = vi.fn();
const drawParticipantFindUnique = vi.fn();
const drawParticipantFindUniqueOrThrow = vi.fn();
const drawParticipantAggregate = vi.fn();
const drawParticipantFindMany = vi.fn();
const txDrawParticipantCreate = vi.fn();
const txDrawParticipantDelete = vi.fn();
const auditCreate = vi.fn();

const fakeTx = {
  drawParticipant: { create: txDrawParticipantCreate, delete: txDrawParticipantDelete },
  auditLog: { create: auditCreate },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    heat: { findUniqueOrThrow: (...a: unknown[]) => heatFindUniqueOrThrow(...a) },
    registration: { findUniqueOrThrow: (...a: unknown[]) => registrationFindUniqueOrThrow(...a), findMany: (...a: unknown[]) => registrationFindMany(...a) },
    division: { findMany: (...a: unknown[]) => divisionFindMany(...a) },
    drawParticipant: {
      findFirst: (...a: unknown[]) => drawParticipantFindFirst(...a),
      findUnique: (...a: unknown[]) => drawParticipantFindUnique(...a),
      findUniqueOrThrow: (...a: unknown[]) => drawParticipantFindUniqueOrThrow(...a),
      aggregate: (...a: unknown[]) => drawParticipantAggregate(...a),
      findMany: (...a: unknown[]) => drawParticipantFindMany(...a),
    },
    $transaction: (fn: (tx: typeof fakeTx) => unknown) => fn(fakeTx),
  },
}));

const { addDrawHelper, removeDrawHelper, listHelperCandidates } = await import("@/server/competition/draw-helper");
const { ValidationFailedError } = await import("@/server/errors");

const actor: Actor = { userId: "u1", email: "a@b.by", globalPermissions: new Set(), permissionsByCompetition: new Map() };

function baseHeat(overrides: Record<string, unknown> = {}) {
  return {
    id: "heat1",
    roundId: "round1",
    status: "PENDING",
    round: {
      status: "DRAWING",
      divisionId: "div1",
      division: { id: "div1", competitionId: "comp1" },
    },
    draws: [{ id: "draw1", version: 1 }],
    ...overrides,
  };
}

function baseHelperReg(overrides: Record<string, unknown> = {}) {
  return {
    id: "reg-helper",
    competitionId: "comp1",
    divisionId: "div-other",
    status: "REGISTERED",
    role: "LEADER",
    checkIn: { status: "CHECKED_IN" },
    ...overrides,
  };
}

beforeEach(() => {
  requirePermissionMock.mockReset().mockResolvedValue(actor);
  heatFindUniqueOrThrow.mockReset().mockResolvedValue(baseHeat());
  registrationFindUniqueOrThrow.mockReset().mockResolvedValue(baseHelperReg());
  registrationFindMany.mockReset().mockResolvedValue([]);
  divisionFindMany.mockReset().mockResolvedValue([]);
  drawParticipantFindFirst.mockReset().mockResolvedValue(null);
  drawParticipantFindUnique.mockReset().mockResolvedValue(null);
  drawParticipantFindUniqueOrThrow.mockReset();
  drawParticipantAggregate.mockReset().mockResolvedValue({ _max: { calledOrder: 4 } });
  drawParticipantFindMany.mockReset().mockResolvedValue([]);
  txDrawParticipantCreate.mockReset().mockResolvedValue({ id: "participant1" });
  txDrawParticipantDelete.mockReset().mockResolvedValue({});
  auditCreate.mockReset();
});

describe("addDrawHelper()", () => {
  it("проверяет право draw:override для competitionId соревнования", async () => {
    await addDrawHelper("heat1", "reg-helper", "LEADER");
    expect(requirePermissionMock).toHaveBeenCalledWith("draw:override", "comp1");
  });

  it("отклоняет, если раунд не в статусе DRAWING", async () => {
    heatFindUniqueOrThrow.mockResolvedValue(baseHeat({ round: { status: "DRAW_LOCKED", divisionId: "div1", division: { id: "div1", competitionId: "comp1" } } }));
    await expect(addDrawHelper("heat1", "reg-helper", "LEADER")).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it("отклоняет, если заезд уже не PENDING", async () => {
    heatFindUniqueOrThrow.mockResolvedValue(baseHeat({ status: "RUNNING" }));
    await expect(addDrawHelper("heat1", "reg-helper", "LEADER")).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it("отклоняет, если для заезда ещё не сформирован список", async () => {
    heatFindUniqueOrThrow.mockResolvedValue(baseHeat({ draws: [] }));
    await expect(addDrawHelper("heat1", "reg-helper", "LEADER")).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it("отклоняет помощника из другого соревнования", async () => {
    registrationFindUniqueOrThrow.mockResolvedValue(baseHelperReg({ competitionId: "comp-other" }));
    await expect(addDrawHelper("heat1", "reg-helper", "LEADER")).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it("отклоняет помощника без check-in", async () => {
    registrationFindUniqueOrThrow.mockResolvedValue(baseHelperReg({ checkIn: null }));
    await expect(addDrawHelper("heat1", "reg-helper", "LEADER")).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it("отклоняет, если роль помощника не совпадает с его собственной ролью регистрации", async () => {
    registrationFindUniqueOrThrow.mockResolvedValue(baseHelperReg({ role: "FOLLOWER" }));
    await expect(addDrawHelper("heat1", "reg-helper", "LEADER")).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it("гость из другого дивизиона допускается без проверки — helperSource GUEST_HIGHER_CATEGORY", async () => {
    await addDrawHelper("heat1", "reg-helper", "LEADER");
    expect(txDrawParticipantCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ helperSource: "GUEST_HIGHER_CATEGORY", scored: false }) })
    );
  });

  it("участник СВОЕГО дивизиона отклоняется, если ещё не станцевал (не scored) в этом раунде", async () => {
    registrationFindUniqueOrThrow.mockResolvedValue(baseHelperReg({ divisionId: "div1" }));
    drawParticipantFindFirst.mockResolvedValue(null);
    await expect(addDrawHelper("heat1", "reg-helper", "LEADER")).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it("участник своего дивизиона допускается, если уже scored в другом заезде — REUSED_ALREADY_SCORED", async () => {
    registrationFindUniqueOrThrow.mockResolvedValue(baseHelperReg({ divisionId: "div1" }));
    drawParticipantFindFirst.mockResolvedValue({ id: "old-participant" });
    await addDrawHelper("heat1", "reg-helper", "LEADER");
    expect(txDrawParticipantCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ helperSource: "REUSED_ALREADY_SCORED" }) })
    );
  });

  it("отклоняет, если этот участник уже в списке заезда", async () => {
    drawParticipantFindUnique.mockResolvedValue({ id: "already-here" });
    await expect(addDrawHelper("heat1", "reg-helper", "LEADER")).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it("calledOrder = максимальный существующий + 1", async () => {
    drawParticipantAggregate.mockResolvedValue({ _max: { calledOrder: 7 } });
    await addDrawHelper("heat1", "reg-helper", "LEADER");
    expect(txDrawParticipantCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ calledOrder: 8 }) }));
  });
});

describe("removeDrawHelper()", () => {
  function baseParticipant(overrides: Record<string, unknown> = {}) {
    return {
      id: "participant1",
      registrationId: "reg-helper",
      role: "LEADER",
      helperSource: "GUEST_HIGHER_CATEGORY",
      draw: { heat: { status: "PENDING", round: { division: { competitionId: "comp1" } } } },
      ...overrides,
    };
  }

  beforeEach(() => {
    drawParticipantFindUniqueOrThrow.mockResolvedValue(baseParticipant());
  });

  it("проверяет право draw:override", async () => {
    await removeDrawHelper("participant1");
    expect(requirePermissionMock).toHaveBeenCalledWith("draw:override", "comp1");
  });

  it("отклоняет удаление НЕ-помощника (helperSource = null) — это основной участник", async () => {
    drawParticipantFindUniqueOrThrow.mockResolvedValue(baseParticipant({ helperSource: null }));
    await expect(removeDrawHelper("participant1")).rejects.toBeInstanceOf(ValidationFailedError);
    expect(txDrawParticipantDelete).not.toHaveBeenCalled();
  });

  it("отклоняет, если заезд уже не PENDING", async () => {
    drawParticipantFindUniqueOrThrow.mockResolvedValue(
      baseParticipant({ draw: { heat: { status: "RUNNING", round: { division: { competitionId: "comp1" } } } } })
    );
    await expect(removeDrawHelper("participant1")).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it("удаляет помощника и пишет аудит", async () => {
    await removeDrawHelper("participant1");
    expect(txDrawParticipantDelete).toHaveBeenCalledWith({ where: { id: "participant1" } });
    expect(auditCreate).toHaveBeenCalledOnce();
  });
});

describe("listHelperCandidates()", () => {
  it("предлагает ближайшую категорию СТРОГО выше по order", async () => {
    heatFindUniqueOrThrow.mockResolvedValue({
      id: "heat1",
      roundId: "round1",
      round: { divisionId: "div1", division: { id: "div1", competitionId: "comp1", category: { order: 2 } } },
    });
    divisionFindMany.mockResolvedValue([
      { id: "div1", category: { name: "Любители", order: 2 } },
      { id: "div-higher", category: { name: "Продвинутые", order: 3 } },
      { id: "div-lower", category: { name: "Начинающие", order: 1 } },
    ]);
    registrationFindMany.mockImplementation(({ where }: { where: { divisionId: string } }) => {
      if (where.divisionId === "div-higher") {
        return Promise.resolve([{ id: "reg-higher", dancer: { displayName: "A" }, checkIn: { bibNumber: "1" } }]);
      }
      if (where.divisionId === "div-lower") {
        return Promise.resolve([{ id: "reg-lower", dancer: { displayName: "B" }, checkIn: { bibNumber: "2" } }]);
      }
      return Promise.resolve([]);
    });

    const result = await listHelperCandidates("heat1", "LEADER");

    expect(result.suggestedRegistrationId).toBe("reg-higher");
  });

  it("если категории выше нет — предлагает ближайшую ниже", async () => {
    heatFindUniqueOrThrow.mockResolvedValue({
      id: "heat1",
      roundId: "round1",
      round: { divisionId: "div1", division: { id: "div1", competitionId: "comp1", category: { order: 3 } } },
    });
    divisionFindMany.mockResolvedValue([
      { id: "div1", category: { name: "Профи", order: 3 } },
      { id: "div-lower", category: { name: "Начинающие", order: 1 } },
    ]);
    registrationFindMany.mockImplementation(({ where }: { where: { divisionId: string } }) =>
      where.divisionId === "div-lower"
        ? Promise.resolve([{ id: "reg-lower", dancer: { displayName: "B" }, checkIn: { bibNumber: "2" } }])
        : Promise.resolve([])
    );

    const result = await listHelperCandidates("heat1", "LEADER");

    expect(result.suggestedRegistrationId).toBe("reg-lower");
  });

  it("в своём дивизионе показывает только тех, кто уже scored в другом заезде раунда", async () => {
    heatFindUniqueOrThrow.mockResolvedValue({
      id: "heat1",
      roundId: "round1",
      round: { divisionId: "div1", division: { id: "div1", competitionId: "comp1", category: { order: 2 } } },
    });
    divisionFindMany.mockResolvedValue([{ id: "div1", category: { name: "Любители", order: 2 } }]);
    registrationFindMany.mockResolvedValue([
      { id: "reg-not-scored", dancer: { displayName: "A" }, checkIn: { bibNumber: "1" } },
      { id: "reg-scored", dancer: { displayName: "B" }, checkIn: { bibNumber: "2" } },
    ]);
    drawParticipantFindMany.mockResolvedValue([{ registrationId: "reg-scored" }]);

    const result = await listHelperCandidates("heat1", "LEADER");

    const own = result.divisions.find((d) => d.divisionId === "div1");
    expect(own?.registrations.map((r) => r.id)).toEqual(["reg-scored"]);
  });
});
