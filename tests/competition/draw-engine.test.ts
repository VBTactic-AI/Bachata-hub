import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Actor } from "@/server/rbac/actor";

vi.mock("node:crypto", () => ({
  default: { randomBytes: () => Buffer.from("deadbeefcafebabe", "hex") },
}));

const requirePermissionMock = vi.fn();
vi.mock("@/server/rbac/authorize", () => ({ requirePermission: (...a: unknown[]) => requirePermissionMock(...a) }));

const heatFindUniqueOrThrow = vi.fn();
const topDrawFindFirst = vi.fn();
const drawFindFirst = vi.fn();
const heatFindMany = vi.fn();
const heatFindFirstTx = vi.fn();
const heatCreateTx = vi.fn();
const registrationFindMany = vi.fn();
const divisionFindUniqueOrThrow = vi.fn();
const divisionFindMany = vi.fn();
const drawCreate = vi.fn();
const drawParticipantCreate = vi.fn();
const drawParticipantDeleteMany = vi.fn();
const auditCreate = vi.fn();

const fakeTx = {
  draw: { findFirst: drawFindFirst, create: drawCreate },
  heat: { findMany: heatFindMany, findFirst: heatFindFirstTx, create: heatCreateTx },
  registration: { findMany: registrationFindMany },
  division: { findUniqueOrThrow: divisionFindUniqueOrThrow, findMany: divisionFindMany },
  drawParticipant: { create: drawParticipantCreate, deleteMany: drawParticipantDeleteMany },
  auditLog: { create: auditCreate },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    heat: { findUniqueOrThrow: (...a: unknown[]) => heatFindUniqueOrThrow(...a) },
    draw: { findFirst: (...a: unknown[]) => topDrawFindFirst(...a) },
    $transaction: (fn: (tx: typeof fakeTx) => unknown) => fn(fakeTx),
  },
}));

const { formDrawInTx, rerollHeatDraw, splitHeatOverflow, getDrawCallOrder } = await import(
  "@/server/competition/draw-engine"
);
const { ValidationFailedError } = await import("@/server/errors");

const actor: Actor = { userId: "u1", email: "a@b.by", globalPermissions: new Set(), permissionsByCompetition: new Map() };

function reg(id: string, bibNumber: string) {
  return { id, checkIn: { bibNumber } };
}

beforeEach(() => {
  requirePermissionMock.mockReset().mockResolvedValue(actor);
  heatFindUniqueOrThrow.mockReset();
  topDrawFindFirst.mockReset().mockResolvedValue(null);
  drawFindFirst.mockReset().mockResolvedValue(null);
  heatFindMany.mockReset().mockResolvedValue([]); // нет других заездов с уже станцевавшими
  heatFindFirstTx.mockReset().mockResolvedValue(null);
  heatCreateTx.mockReset().mockImplementation(({ data }: { data: { number: number } }) =>
    Promise.resolve({ id: "new-heat1", ...data })
  );
  drawParticipantDeleteMany.mockReset().mockResolvedValue({ count: 0 });
  registrationFindMany.mockReset().mockImplementation(({ where }: { where: { role: string; divisionId: string } }) => {
    if (where.divisionId !== "div1") return Promise.resolve([]); // гостевые дивизионы по умолчанию пустые
    return Promise.resolve(
      where.role === "LEADER" ? [reg("l1", "3"), reg("l2", "1"), reg("l3", "2")] : [reg("f1", "5"), reg("f2", "4")]
    );
  });
  divisionFindUniqueOrThrow.mockReset().mockResolvedValue({ competitionId: "comp1", category: { order: 2 } });
  divisionFindMany.mockReset().mockResolvedValue([]); // по умолчанию гостевых дивизионов нет
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

// Авто-добор помощников сразу при жеребьёвке, без подтверждения — по
// явному запросу пользователя (2026-09-04).
describe("formDrawInTx() — авто-добор помощников при дисбалансе", () => {
  it("не трогает гостевые дивизионы и не зовёт помощников, если сторон и так поровну", async () => {
    registrationFindMany.mockImplementation(({ where }: { where: { role: string; divisionId: string } }) => {
      if (where.divisionId !== "div1") return Promise.resolve([]);
      return Promise.resolve(where.role === "LEADER" ? [reg("l1", "1"), reg("l2", "2")] : [reg("f1", "3"), reg("f2", "4")]);
    });

    await formDrawInTx(fakeTx as never, {
      heatId: "heat1",
      roundId: "round1",
      divisionId: "div1",
      heatCapacity: 10,
      callOrder: "SEQUENTIAL",
      actor,
    });

    expect(divisionFindUniqueOrThrow).not.toHaveBeenCalled();
    const helperCalls = drawParticipantCreate.mock.calls.filter((c) => c[0].data.scored === false);
    expect(helperCalls).toHaveLength(0);
  });

  it("при дисбалансе сам добавляет гостя из другого дивизиона без подтверждения", async () => {
    divisionFindMany.mockResolvedValue([{ id: "div-guest", category: { order: 3 } }]);
    registrationFindMany.mockImplementation(({ where }: { where: { role: string; divisionId: string } }) => {
      if (where.divisionId === "div1") {
        return Promise.resolve(
          where.role === "LEADER" ? [reg("l1", "1"), reg("l2", "2"), reg("l3", "3")] : [reg("f1", "4"), reg("f2", "5")]
        );
      }
      if (where.divisionId === "div-guest" && where.role === "FOLLOWER") {
        return Promise.resolve([reg("guest-f1", "99")]);
      }
      return Promise.resolve([]);
    });

    await formDrawInTx(fakeTx as never, {
      heatId: "heat1",
      roundId: "round1",
      divisionId: "div1",
      heatCapacity: 10,
      callOrder: "SEQUENTIAL",
      actor,
    });

    const helperCalls = drawParticipantCreate.mock.calls.filter((c) => c[0].data.scored === false);
    expect(helperCalls).toHaveLength(1);
    expect(helperCalls[0][0].data).toMatchObject({
      registrationId: "guest-f1",
      role: "FOLLOWER",
      scored: false,
      helperSource: "GUEST_HIGHER_CATEGORY",
    });
    expect(auditCreate.mock.calls[0][0].data.after.autoHelperIds).toEqual(["guest-f1"]);
  });

  it("если подходящих гостей не нашлось — не падает, просто оставляет дисбаланс", async () => {
    divisionFindMany.mockResolvedValue([{ id: "div-guest", category: { order: 3 } }]);
    registrationFindMany.mockImplementation(({ where }: { where: { role: string; divisionId: string } }) => {
      if (where.divisionId !== "div1") return Promise.resolve([]);
      return Promise.resolve(
        where.role === "LEADER"
          ? [reg("l1", "1"), reg("l2", "2"), reg("l3", "3"), reg("l4", "4"), reg("l5", "5")]
          : [reg("f1", "6")]
      );
    });

    const result = await formDrawInTx(fakeTx as never, {
      heatId: "heat1",
      roundId: "round1",
      divisionId: "div1",
      heatCapacity: 10,
      callOrder: "SEQUENTIAL",
      actor,
    });

    const helperCalls = drawParticipantCreate.mock.calls.filter((c) => c[0].data.scored === false);
    expect(helperCalls).toHaveLength(0);
    expect(result.leaderCount).toBe(5);
    expect(result.followerCount).toBe(1);
  });
});

// Уточнение каскада от 2026-09-04: перебираем ВСЕ категории выше по очереди
// (не только ближайшую), потом — своих уже станцевавших, и только тогда
// оставляем разбалансированным — категории НИЖЕ сама жеребьёвка не трогает,
// это уже ручное решение организатора (docs/00_DECISIONS.md, A10).
describe("formDrawInTx() — каскад: все категории выше, потом свои, ниже — только вручную", () => {
  it("перебирает КАЖДУЮ категорию выше по очереди, пока не найдёт кандидата", async () => {
    divisionFindMany.mockResolvedValue([
      { id: "div-higher1", category: { order: 3 } },
      { id: "div-higher2", category: { order: 4 } },
    ]);
    registrationFindMany.mockImplementation(({ where }: { where: { role: string; divisionId: string; id?: unknown } }) => {
      if (where.id) return Promise.resolve([]); // до переиспользования своих дойти не должно
      if (where.divisionId === "div-higher1") return Promise.resolve([]); // в ближайшей выше — никого
      if (where.divisionId === "div-higher2") return Promise.resolve([reg("guest-higher2", "50")]); // в следующей — есть
      if (where.divisionId !== "div1") return Promise.resolve([]);
      return Promise.resolve(where.role === "LEADER" ? [reg("l1", "1"), reg("l2", "2"), reg("l3", "3")] : [reg("f1", "4")]);
    });

    await formDrawInTx(fakeTx as never, {
      heatId: "heat1",
      roundId: "round1",
      divisionId: "div1",
      heatCapacity: 10,
      callOrder: "SEQUENTIAL",
      actor,
    });

    const helperCalls = drawParticipantCreate.mock.calls.filter((c) => c[0].data.scored === false);
    expect(helperCalls).toHaveLength(1);
    expect(helperCalls[0][0].data).toMatchObject({ registrationId: "guest-higher2", helperSource: "GUEST_HIGHER_CATEGORY" });
  });

  it("если категорий выше совсем нет (или там пусто) — переиспользует своих уже станцевавших", async () => {
    heatFindMany.mockResolvedValue([{ draws: [{ participants: [{ registrationId: "reused-f1" }] }] }]);
    divisionFindMany.mockResolvedValue([]);
    registrationFindMany.mockImplementation(({ where }: { where: { role: string; divisionId: string; id?: unknown } }) => {
      if (where.id) return Promise.resolve([{ id: "reused-f1" }]);
      if (where.divisionId !== "div1") return Promise.resolve([]);
      return Promise.resolve(where.role === "LEADER" ? [reg("l1", "1"), reg("l2", "2"), reg("l3", "3")] : [reg("f1", "4")]);
    });

    await formDrawInTx(fakeTx as never, {
      heatId: "heat1",
      roundId: "round1",
      divisionId: "div1",
      heatCapacity: 10,
      callOrder: "SEQUENTIAL",
      actor,
    });

    const helperCalls = drawParticipantCreate.mock.calls.filter((c) => c[0].data.scored === false);
    expect(helperCalls).toHaveLength(1);
    expect(helperCalls[0][0].data).toMatchObject({
      registrationId: "reused-f1",
      role: "FOLLOWER",
      helperSource: "REUSED_ALREADY_SCORED",
    });
  });

  it("не спускается в категории ниже сама, даже если выше и переиспользовать некого", async () => {
    divisionFindMany.mockResolvedValue([]); // нет категорий выше
    registrationFindMany.mockImplementation(({ where }: { where: { role: string; divisionId: string; id?: unknown } }) => {
      if (where.id) return Promise.resolve([]); // переиспользовать некого (нет уже станцевавших)
      if (where.divisionId !== "div1") return Promise.resolve([]);
      return Promise.resolve(where.role === "LEADER" ? [reg("l1", "1"), reg("l2", "2"), reg("l3", "3")] : [reg("f1", "4")]);
    });

    const result = await formDrawInTx(fakeTx as never, {
      heatId: "heat1",
      roundId: "round1",
      divisionId: "div1",
      heatCapacity: 10,
      callOrder: "SEQUENTIAL",
      actor,
    });

    const helperCalls = drawParticipantCreate.mock.calls.filter((c) => c[0].data.scored === false);
    expect(helperCalls).toHaveLength(0);
    expect(result.leaderCount).toBe(3);
    expect(result.followerCount).toBe(1);
  });
});

describe("splitHeatOverflow() — «Способ Б»: перенос избытка в новый заезд", () => {
  function baseSplitHeat(overrides: Record<string, unknown> = {}) {
    return {
      id: "heat1",
      roundId: "round1",
      status: "PENDING",
      round: {
        status: "DRAWING",
        division: { id: "div1", competitionId: "comp1", category: { order: 2 } },
      },
      ...overrides,
    };
  }

  function baseSplitDraw(overrides: Record<string, unknown> = {}) {
    return {
      id: "draw1",
      participants: [
        { id: "p-l1", registrationId: "l1", role: "LEADER", scored: true, calledOrder: 1 },
        { id: "p-l2", registrationId: "l2", role: "LEADER", scored: true, calledOrder: 2 },
        { id: "p-l3", registrationId: "l3", role: "LEADER", scored: true, calledOrder: 3 },
        { id: "p-f1", registrationId: "f1", role: "FOLLOWER", scored: true, calledOrder: 4 },
        {
          id: "p-h1",
          registrationId: "guest0",
          role: "FOLLOWER",
          scored: false,
          helperSource: "GUEST_HIGHER_CATEGORY",
          calledOrder: 5,
        },
      ],
      ...overrides,
    };
  }

  beforeEach(() => {
    heatFindUniqueOrThrow.mockResolvedValue(baseSplitHeat());
    topDrawFindFirst.mockResolvedValue(baseSplitDraw());
    heatFindFirstTx.mockResolvedValue({ number: 1 });
  });

  it("проверяет право draw:override", async () => {
    await splitHeatOverflow("heat1");
    expect(requirePermissionMock).toHaveBeenCalledWith("draw:override", "comp1");
  });

  it("отклоняет, если раунд не в статусе DRAWING", async () => {
    heatFindUniqueOrThrow.mockResolvedValue(
      baseSplitHeat({ round: { status: "DRAW_LOCKED", division: { id: "div1", competitionId: "comp1", category: { order: 2 } } } })
    );
    await expect(splitHeatOverflow("heat1")).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it("отклоняет, если заезд уже не PENDING", async () => {
    heatFindUniqueOrThrow.mockResolvedValue(baseSplitHeat({ status: "RUNNING" }));
    await expect(splitHeatOverflow("heat1")).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it("отклоняет, если для заезда ещё нет жеребьёвки", async () => {
    topDrawFindFirst.mockResolvedValue(null);
    await expect(splitHeatOverflow("heat1")).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it("отклоняет, если заезд уже сбалансирован — разбивать нечего", async () => {
    topDrawFindFirst.mockResolvedValue(
      baseSplitDraw({
        participants: [
          { id: "p-l1", registrationId: "l1", role: "LEADER", scored: true, calledOrder: 1 },
          { id: "p-f1", registrationId: "f1", role: "FOLLOWER", scored: true, calledOrder: 2 },
        ],
      })
    );
    await expect(splitHeatOverflow("heat1")).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it("удаляет из текущего заезда лишних (излишек) и ВСЕХ помощников", async () => {
    await splitHeatOverflow("heat1");
    expect(drawParticipantDeleteMany).toHaveBeenCalledWith({ where: { id: { in: ["p-l2", "p-l3", "p-h1"] } } });
  });

  it("переносит именно излишек по порядку вызова — l1 остаётся, l2/l3 уходят", async () => {
    await splitHeatOverflow("heat1");
    const movedCalls = drawParticipantCreate.mock.calls.filter((c) => c[0].data.scored === true);
    expect(movedCalls.map((c) => c[0].data.registrationId)).toEqual(["l2", "l3"]);
    expect(movedCalls.every((c) => c[0].data.role === "LEADER")).toBe(true);
  });

  it("создаёт новый заезд со следующим номером в том же раунде", async () => {
    heatFindFirstTx.mockResolvedValue({ number: 4 });
    await splitHeatOverflow("heat1");
    expect(heatCreateTx).toHaveBeenCalledWith({ data: { roundId: "round1", number: 5 } });
  });

  it("автодобор для нового заезда: сначала свои уже станцевавшие, потом каскад по категориям выше", async () => {
    heatFindMany.mockResolvedValue([{ draws: [{ participants: [{ registrationId: "reused-f1" }] }] }]);
    divisionFindMany.mockResolvedValue([{ id: "div-guest", category: { order: 3 } }]);
    registrationFindMany.mockImplementation(
      ({ where }: { where: { role: string; divisionId?: string; id?: unknown } }) => {
        if (where.id) return Promise.resolve([{ id: "reused-f1" }]);
        if (where.divisionId === "div-guest" && where.role === "FOLLOWER") return Promise.resolve([{ id: "guest-f1" }]);
        return Promise.resolve([]);
      }
    );

    await splitHeatOverflow("heat1");

    const helperCalls = drawParticipantCreate.mock.calls.filter((c) => c[0].data.scored === false);
    expect(helperCalls.map((c) => c[0].data.registrationId)).toEqual(["reused-f1", "guest-f1"]);
    expect(helperCalls[0][0].data.helperSource).toBe("REUSED_ALREADY_SCORED");
    expect(helperCalls[1][0].data.helperSource).toBe("GUEST_HIGHER_CATEGORY");
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
