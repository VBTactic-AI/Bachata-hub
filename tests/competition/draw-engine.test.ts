import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Actor } from "@/server/rbac/actor";

vi.mock("node:crypto", () => ({
  default: { randomBytes: () => Buffer.from("deadbeefcafebabe", "hex") },
}));

const requirePermissionMock = vi.fn();
vi.mock("@/server/rbac/authorize", () => ({ requirePermission: (...a: unknown[]) => requirePermissionMock(...a) }));

const heatFindUniqueOrThrow = vi.fn();
const drawFindFirst = vi.fn();
const heatFindMany = vi.fn();
const registrationFindMany = vi.fn();
const drawCreate = vi.fn();
const drawParticipantCreate = vi.fn();
const auditCreate = vi.fn();

const fakeTx = {
  draw: { findFirst: drawFindFirst, create: drawCreate },
  heat: { findMany: heatFindMany },
  registration: { findMany: registrationFindMany },
  drawParticipant: { create: drawParticipantCreate },
  auditLog: { create: auditCreate },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    heat: { findUniqueOrThrow: (...a: unknown[]) => heatFindUniqueOrThrow(...a) },
    $transaction: (fn: (tx: typeof fakeTx) => unknown) => fn(fakeTx),
  },
}));

const { formDrawInTx, rerollHeatDraw, getDrawCallOrder } = await import("@/server/competition/draw-engine");
const { ValidationFailedError } = await import("@/server/errors");

const actor: Actor = { userId: "u1", email: "a@b.by", globalPermissions: new Set(), permissionsByCompetition: new Map() };

function reg(id: string, bibNumber: string) {
  return { id, checkIn: { bibNumber } };
}

beforeEach(() => {
  requirePermissionMock.mockReset().mockResolvedValue(actor);
  heatFindUniqueOrThrow.mockReset();
  drawFindFirst.mockReset().mockResolvedValue(null);
  heatFindMany.mockReset().mockResolvedValue([]); // нет других заездов с уже станцевавшими
  registrationFindMany.mockReset().mockImplementation(({ where }: { where: { role: string } }) =>
    Promise.resolve(where.role === "LEADER" ? [reg("l1", "3"), reg("l2", "1"), reg("l3", "2")] : [reg("f1", "5"), reg("f2", "4")])
  );
  drawCreate.mockReset().mockImplementation(({ data }: { data: { version: number } }) =>
    Promise.resolve({ id: `draw-v${data.version}`, ...data })
  );
  drawParticipantCreate.mockReset().mockResolvedValue({});
  auditCreate.mockReset();
});

describe("formDrawInTx() — базовое формирование списка", () => {
  it("зовёт всех подходящих (леди/лидеров), если их меньше вместимости заезда", async () => {
    const result = await formDrawInTx(fakeTx as never, {
      heatId: "heat1",
      roundId: "round1",
      divisionId: "div1",
      heatCapacity: 10,
      callOrder: "SEQUENTIAL",
      actor,
    });

    expect(result.leaderCount).toBe(3);
    expect(result.followerCount).toBe(2);
    expect(drawParticipantCreate).toHaveBeenCalledTimes(5);
    expect(auditCreate).toHaveBeenCalledOnce();
    expect(auditCreate.mock.calls[0][0].data.action).toBe("draw.create");
  });

  it("SEQUENTIAL: вызывает по возрастанию номера (bib), не по алфавиту строки", async () => {
    await formDrawInTx(fakeTx as never, {
      heatId: "heat1",
      roundId: "round1",
      divisionId: "div1",
      heatCapacity: 10,
      callOrder: "SEQUENTIAL",
      actor,
    });

    const leaderCalls = drawParticipantCreate.mock.calls.filter((c) => c[0].data.role === "LEADER");
    expect(leaderCalls.map((c) => c[0].data.registrationId)).toEqual(["l2", "l3", "l1"]); // бибы 1,2,3
  });

  it("ограничивает список вместимостью заезда", async () => {
    registrationFindMany.mockImplementation(({ where }: { where: { role: string } }) =>
      Promise.resolve(
        where.role === "LEADER"
          ? Array.from({ length: 15 }, (_, i) => reg(`l${i}`, String(i)))
          : []
      )
    );

    const result = await formDrawInTx(fakeTx as never, {
      heatId: "heat1",
      roundId: "round1",
      divisionId: "div1",
      heatCapacity: 10,
      callOrder: "SEQUENTIAL",
      actor,
    });

    expect(result.leaderCount).toBe(10);
  });

  it("исключает тех, кто уже получил scored=true в другом заезде этого раунда", async () => {
    heatFindMany.mockResolvedValue([{ draws: [{ participants: [{ registrationId: "l1" }] }] }]);

    const result = await formDrawInTx(fakeTx as never, {
      heatId: "heat1",
      roundId: "round1",
      divisionId: "div1",
      heatCapacity: 10,
      callOrder: "SEQUENTIAL",
      actor,
    });

    expect(result.leaderCount).toBe(2); // l1 исключён
    const leaderIds = drawParticipantCreate.mock.calls
      .filter((c) => c[0].data.role === "LEADER")
      .map((c) => c[0].data.registrationId);
    expect(leaderIds).not.toContain("l1");
  });

  it("RANDOM: сохраняет seed, SEQUENTIAL — seed остаётся null", async () => {
    await formDrawInTx(fakeTx as never, {
      heatId: "heat1",
      roundId: "round1",
      divisionId: "div1",
      heatCapacity: 10,
      callOrder: "RANDOM",
      actor,
    });
    expect(drawCreate.mock.calls[0][0].data.seed).toBe("deadbeefcafebabe");

    drawCreate.mockClear();
    await formDrawInTx(fakeTx as never, {
      heatId: "heat1",
      roundId: "round1",
      divisionId: "div1",
      heatCapacity: 10,
      callOrder: "SEQUENTIAL",
      actor,
    });
    expect(drawCreate.mock.calls[0][0].data.seed).toBeNull();
  });
});

describe("formDrawInTx() — версии и reroll", () => {
  it("первое формирование не требует причины", async () => {
    drawFindFirst.mockResolvedValue(null);
    await expect(
      formDrawInTx(fakeTx as never, {
        heatId: "heat1",
        roundId: "round1",
        divisionId: "div1",
        heatCapacity: 10,
        callOrder: "SEQUENTIAL",
        actor,
      })
    ).resolves.toBeDefined();
    expect(drawCreate.mock.calls[0][0].data.version).toBe(1);
  });

  it("пересборка (версия > 1) без причины отклоняется", async () => {
    drawFindFirst.mockResolvedValue({ version: 1 });
    await expect(
      formDrawInTx(fakeTx as never, {
        heatId: "heat1",
        roundId: "round1",
        divisionId: "div1",
        heatCapacity: 10,
        callOrder: "SEQUENTIAL",
        actor,
      })
    ).rejects.toBeInstanceOf(ValidationFailedError);
    expect(drawCreate).not.toHaveBeenCalled();
  });

  it("пересборка с причиной создаёт новую версию, старая не трогается", async () => {
    drawFindFirst.mockResolvedValue({ version: 1 });
    await formDrawInTx(fakeTx as never, {
      heatId: "heat1",
      roundId: "round1",
      divisionId: "div1",
      heatCapacity: 10,
      callOrder: "SEQUENTIAL",
      actor,
      reason: "судья ошибся с составом",
    });
    expect(drawCreate.mock.calls[0][0].data.version).toBe(2);
    expect(drawCreate.mock.calls[0][0].data.reason).toBe("судья ошибся с составом");
  });
});

describe("rerollHeatDraw()", () => {
  beforeEach(() => {
    heatFindUniqueOrThrow.mockResolvedValue({
      id: "heat1",
      roundId: "round1",
      status: "PENDING",
      round: {
        status: "DRAWING",
        divisionId: "div1",
        heatCapacity: null,
        config: { drawCallOrder: "SEQUENTIAL" },
        division: { id: "div1", competitionId: "comp1", heatCapacity: 8 },
      },
    });
    drawFindFirst.mockResolvedValue({ version: 1 });
  });

  it("проверяет право draw:reroll", async () => {
    await rerollHeatDraw("heat1", "причина");
    expect(requirePermissionMock).toHaveBeenCalledWith("draw:reroll", "comp1");
  });

  it("отклоняет, если раунд не в статусе DRAWING", async () => {
    heatFindUniqueOrThrow.mockResolvedValue({
      id: "heat1",
      roundId: "round1",
      status: "PENDING",
      round: { status: "DRAW_LOCKED", divisionId: "div1", heatCapacity: null, config: {}, division: { id: "div1", competitionId: "comp1", heatCapacity: 8 } },
    });
    await expect(rerollHeatDraw("heat1", "причина")).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it("отклоняет, если заезд уже не PENDING (запущен)", async () => {
    heatFindUniqueOrThrow.mockResolvedValue({
      id: "heat1",
      roundId: "round1",
      status: "RUNNING",
      round: { status: "DRAWING", divisionId: "div1", heatCapacity: null, config: {}, division: { id: "div1", competitionId: "comp1", heatCapacity: 8 } },
    });
    await expect(rerollHeatDraw("heat1", "причина")).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it("использует heatCapacity раунда, если он задан, иначе дивизиона", async () => {
    heatFindUniqueOrThrow.mockResolvedValue({
      id: "heat1",
      roundId: "round1",
      status: "PENDING",
      round: { status: "DRAWING", divisionId: "div1", heatCapacity: 2, config: { drawCallOrder: "SEQUENTIAL" }, division: { id: "div1", competitionId: "comp1", heatCapacity: 8 } },
    });
    const result = await rerollHeatDraw("heat1", "причина");
    expect(result.leaderCount).toBe(2); // heatCapacity раунда (2) переопределяет дивизион (8), доступно 3 лидера
  });
});

describe("getDrawCallOrder()", () => {
  it("читает drawCallOrder из Round.config", () => {
    expect(getDrawCallOrder({ drawCallOrder: "RANDOM" })).toBe("RANDOM");
    expect(getDrawCallOrder({})).toBeNull();
    expect(getDrawCallOrder(null)).toBeNull();
  });
});
