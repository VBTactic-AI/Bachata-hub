import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Actor } from "@/server/rbac/actor";

const requirePermissionMock = vi.fn();
vi.mock("@/server/rbac/authorize", () => ({ requirePermission: (...a: unknown[]) => requirePermissionMock(...a) }));

const fillHelperShortageMock = vi.fn();
vi.mock("@/server/competition/draw-engine", () => ({ fillHelperShortage: (...a: unknown[]) => fillHelperShortageMock(...a) }));

const txRoundFindUniqueOrThrow = vi.fn();
const txRoundFindMany = vi.fn();
const txRoundCreate = vi.fn();
const txRoundUpdate = vi.fn();
const txRoundUpdateMany = vi.fn();
const txRoundCount = vi.fn();
const txHeatFindMany = vi.fn();
const txHeatCreate = vi.fn();
const txDrawCreate = vi.fn();
const txDrawParticipantCreate = vi.fn();
const txDrawParticipantCreateMany = vi.fn();
const txRoundResultCount = vi.fn();
const txRoundResultCreateMany = vi.fn();
const txRoundResultUpsert = vi.fn();
const txRoundResultUpdate = vi.fn();
const txJudgeAssignmentFindMany = vi.fn();
const txJudgeScoreCount = vi.fn();
const auditCreate = vi.fn();

const fakeTx = {
  round: {
    findUniqueOrThrow: txRoundFindUniqueOrThrow,
    findMany: txRoundFindMany,
    create: txRoundCreate,
    update: txRoundUpdate,
    updateMany: txRoundUpdateMany,
    count: txRoundCount,
  },
  heat: { findMany: txHeatFindMany, create: txHeatCreate },
  draw: { create: txDrawCreate },
  drawParticipant: { create: txDrawParticipantCreate, createMany: txDrawParticipantCreateMany },
  roundResult: {
    count: txRoundResultCount,
    createMany: txRoundResultCreateMany,
    upsert: txRoundResultUpsert,
    update: txRoundResultUpdate,
  },
  judgeAssignment: { findMany: txJudgeAssignmentFindMany },
  judgeScore: { count: txJudgeScoreCount },
  auditLog: { create: auditCreate },
};

const prismaTransaction = vi.fn((fn: (tx: typeof fakeTx) => unknown) => fn(fakeTx));
const prismaHeatFindFirstOrThrow = vi.fn();
const prismaDrawFindFirstOrThrow = vi.fn();

// prisma.round.* (вне транзакции) переиспользует те же моки, что и
// fakeTx.round.* — этого достаточно для проверки того, ЧТО запрашивается,
// реальной изоляции между "внутри/вне транзакции" в этих тестах не требуется.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    round: { findUniqueOrThrow: txRoundFindUniqueOrThrow },
    heat: { findFirstOrThrow: prismaHeatFindFirstOrThrow },
    draw: { findFirstOrThrow: prismaDrawFindFirstOrThrow },
    $transaction: (fn: (tx: typeof fakeTx) => unknown) => prismaTransaction(fn),
  },
}));

const {
  calculateRoundResultsInTx,
  maybeCalculateOnEntryInTx,
  maybeFinalizeAfterScoreInTx,
  getRoundScoringProgress,
  recordTieBreakDecision,
  rolesNotNeedingJudging,
} = await import("@/server/judging/advancement");
const { ValidationFailedError } = await import("@/server/errors");

const actor: Actor = { userId: "judge1", email: "j@b.by", globalPermissions: new Set(), permissionsByCompetition: new Map() };

function participant(id: string, role: "LEADER" | "FOLLOWER", scores: number[]) {
  return { id, registrationId: `reg-${id}`, role, judgeScores: scores.map((value) => ({ value })) };
}

beforeEach(() => {
  requirePermissionMock.mockReset().mockResolvedValue(actor);
  fillHelperShortageMock.mockReset().mockResolvedValue([]);
  txRoundFindUniqueOrThrow.mockReset();
  txRoundFindMany.mockReset().mockResolvedValue([]);
  txRoundCreate.mockReset().mockResolvedValue({ id: "tb1" });
  txRoundUpdate.mockReset();
  txRoundUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  txRoundCount.mockReset().mockResolvedValue(0);
  txHeatFindMany.mockReset().mockResolvedValue([]);
  txHeatCreate.mockReset().mockResolvedValue({ id: "tbHeat1" });
  txDrawCreate.mockReset().mockResolvedValue({ id: "tbDraw1" });
  txDrawParticipantCreate.mockReset();
  txDrawParticipantCreateMany.mockReset();
  txRoundResultCount.mockReset().mockResolvedValue(0);
  txRoundResultCreateMany.mockReset();
  txRoundResultUpsert.mockReset();
  txRoundResultUpdate.mockReset();
  txJudgeAssignmentFindMany.mockReset().mockResolvedValue([]);
  txJudgeScoreCount.mockReset().mockResolvedValue(0);
  auditCreate.mockReset();
  prismaTransaction.mockClear();
  prismaHeatFindFirstOrThrow.mockReset();
  prismaDrawFindFirstOrThrow.mockReset();
});

const baseRound = {
  id: "round1",
  order: 1,
  divisionId: "div1",
  rulesId: "rules1",
  statusVersion: 1,
  type: null,
  finalistsCount: 10,
  division: { id: "div1", competitionId: "comp1", category: { order: 3 } },
};

describe("calculateRoundResultsInTx() — идемпотентность", () => {
  it("ничего не делает, если результат уже посчитан", async () => {
    txRoundResultCount.mockResolvedValue(5);

    await calculateRoundResultsInTx(fakeTx as never, "round1", actor);

    expect(txRoundFindUniqueOrThrow).not.toHaveBeenCalled();
    expect(txRoundResultCreateMany).not.toHaveBeenCalled();
  });

  it("не считает служебные раунды-перетанцовки автоматически", async () => {
    txRoundFindUniqueOrThrow.mockResolvedValue({ ...baseRound, type: "TIE_BREAK" });

    await calculateRoundResultsInTx(fakeTx as never, "round1", actor);

    expect(txRoundResultCreateMany).not.toHaveBeenCalled();
  });
});

describe("calculateRoundResultsInTx() — классический сценарий (docs §20): нужно провести 10, 3 человека tied за 2 места", () => {
  beforeEach(() => {
    txRoundFindUniqueOrThrow.mockResolvedValue(baseRound);
    // 8 лидеров с чёткими более высокими баллами (проходят чисто),
    // 3 лидера с одинаковым баллом 12 на границе (9-10-11 место),
    // 1 лидер с явно низким баллом (не проходит).
    const clearlyAdvanced = Array.from({ length: 8 }, (_, i) => participant(`L${i + 1}`, "LEADER", [20 - i]));
    const tieGroup = [participant("L9", "LEADER", [12]), participant("L10", "LEADER", [12]), participant("L11", "LEADER", [12])];
    const eliminated = [participant("L12", "LEADER", [1])];
    // Ведомых меньше, чем finalistsCount — проходят все чисто, ничьей нет.
    const followers = Array.from({ length: 5 }, (_, i) => participant(`F${i + 1}`, "FOLLOWER", [10]));

    txHeatFindMany.mockResolvedValue([
      { draws: [{ participants: [...clearlyAdvanced, ...tieGroup, ...eliminated, ...followers] }] },
    ]);
  });

  it("отмечает 8 явных лидеров ADVANCED, 1 — ELIMINATED, всех ведомых — ADVANCED", async () => {
    await calculateRoundResultsInTx(fakeTx as never, "round1", actor);

    const rows: { registrationId: string; status: string }[] = txRoundResultCreateMany.mock.calls[0][0].data;
    const byId = new Map(rows.map((r) => [r.registrationId, r.status]));
    for (let i = 1; i <= 8; i++) expect(byId.get(`reg-L${i}`)).toBe("ADVANCED");
    expect(byId.get("reg-L12")).toBe("ELIMINATED");
    for (let i = 1; i <= 5; i++) expect(byId.get(`reg-F${i}`)).toBe("ADVANCED");
  });

  it("отмечает ровно троих лидеров границы TIE_BREAK_REQUIRED, не выбирая двоих сама", async () => {
    await calculateRoundResultsInTx(fakeTx as never, "round1", actor);

    const rows: { registrationId: string; status: string }[] = txRoundResultCreateMany.mock.calls[0][0].data;
    const tieIds = rows.filter((r) => r.status === "TIE_BREAK_REQUIRED").map((r) => r.registrationId);
    expect(tieIds.sort()).toEqual(["reg-L10", "reg-L11", "reg-L9"]);
  });

  it("не завершает раунд (COMPLETED), пока перетанцовка не разрешена", async () => {
    await calculateRoundResultsInTx(fakeTx as never, "round1", actor);

    expect(txRoundUpdateMany).not.toHaveBeenCalled();
  });

  it("создаёт служебный раунд-перетанцовку с finalistsCount = 2 (свободных мест) и type=TIE_BREAK", async () => {
    await calculateRoundResultsInTx(fakeTx as never, "round1", actor);

    expect(txRoundFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { divisionId: "div1", order: { gte: 2 } } })
    );
    const created: { scored: boolean }[] = txDrawParticipantCreateMany.mock.calls[0][0].data;
    expect(created.filter((p) => p.scored === true)).toHaveLength(3);
    // сам Round создаётся через tx.round.create — но в этих тестах round.create
    // не замокан отдельным полем; заменим на прямую проверку audit-события ниже.
  });

  it("пишет audit tie_break.create с ролью LEADER и remainingSpots=2", async () => {
    await calculateRoundResultsInTx(fakeTx as never, "round1", actor);

    const tieBreakAudit = auditCreate.mock.calls.map((c) => c[0].data).find((d) => d.action === "tie_break.create");
    expect(tieBreakAudit).toBeTruthy();
    expect(tieBreakAudit.after.role).toBe("LEADER");
    expect(tieBreakAudit.after.remainingSpots).toBe(2);
  });

  it("добирает помощников противоположной роли (FOLLOWER) для захода перетанцовки, own-first", async () => {
    fillHelperShortageMock.mockResolvedValue([{ registrationId: "reg-helper1", helperSource: "REUSED_ALREADY_SCORED" }]);

    await calculateRoundResultsInTx(fakeTx as never, "round1", actor);

    expect(fillHelperShortageMock).toHaveBeenCalledWith(
      fakeTx,
      expect.objectContaining({ role: "FOLLOWER", count: 3, preferOwnFirst: true })
    );
  });
});

describe("calculateRoundResultsInTx() — ничья ровно закрывает свободные места (без перетанцовки)", () => {
  it("если tie-группа по размеру совпадает с оставшимися местами — все проходят чисто", async () => {
    txRoundFindUniqueOrThrow.mockResolvedValue({ ...baseRound, finalistsCount: 10 });
    const clearlyAdvanced = Array.from({ length: 8 }, (_, i) => participant(`L${i + 1}`, "LEADER", [20 - i]));
    // Ровно 2 человека делят последние 2 места — неоднозначности нет.
    const tieGroup = [participant("L9", "LEADER", [12]), participant("L10", "LEADER", [12])];
    txHeatFindMany.mockResolvedValue([{ draws: [{ participants: [...clearlyAdvanced, ...tieGroup] }] }]);

    await calculateRoundResultsInTx(fakeTx as never, "round1", actor);

    const rows: { registrationId: string; status: string }[] = txRoundResultCreateMany.mock.calls[0][0].data;
    expect(rows.every((r) => r.status === "ADVANCED")).toBe(true);
    // Раунд завершён сразу же — перетанцовка не создаётся.
    expect(txRoundUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "COMPLETED" }) })
    );
  });
});

describe("calculateRoundResultsInTx() — вставка перетанцовки сдвигает более поздние раунды", () => {
  it("раунды с order >= вставляемого сдвигаются на +1, каждый по отдельности", async () => {
    // 2 свободных места, 3 человека претендуют — настоящая ничья.
    txRoundFindUniqueOrThrow.mockResolvedValue({ ...baseRound, finalistsCount: 2 });
    const tieGroup = [participant("L1", "LEADER", [5]), participant("L2", "LEADER", [5]), participant("L3", "LEADER", [5])];
    txHeatFindMany.mockResolvedValue([{ draws: [{ participants: tieGroup }] }]);
    // Мок не сортирует сам — возвращаем уже в порядке orderBy: {order: "desc"},
    // как это сделала бы реальная БД.
    txRoundFindMany.mockResolvedValue([
      { id: "round3", order: 3 },
      { id: "round2", order: 2 },
    ]);

    await calculateRoundResultsInTx(fakeTx as never, "round1", actor);

    // от последнего к первому — round3 (order 3->4) раньше round2 (order 2->3)
    expect(txRoundUpdate).toHaveBeenNthCalledWith(1, { where: { id: "round3" }, data: { order: 4 } });
    expect(txRoundUpdate).toHaveBeenNthCalledWith(2, { where: { id: "round2" }, data: { order: 3 } });
  });
});

// По запросу пользователя (2026-09-04): если участников роли не больше,
// чем мест на следующий раунд, отсеивать некого — судьи эту роль не
// оценивают, в финале же "проходят N" — призовые места, а не отсев, поэтому
// финал оценивает всегда.
describe("rolesNotNeedingJudging() — чистая функция", () => {
  it("пропускает роль, где участников не больше мест, вне финала", () => {
    const skipped = rolesNotNeedingJudging({ LEADER: 5, FOLLOWER: 9 }, 6, false, null);
    expect(skipped.has("LEADER")).toBe(true);
    expect(skipped.has("FOLLOWER")).toBe(false);
  });

  it("не пропускает ничего в финале, даже если участников <= мест", () => {
    const skipped = rolesNotNeedingJudging({ LEADER: 5, FOLLOWER: 9 }, 6, true, null);
    expect(skipped.size).toBe(0);
  });

  it("не пропускает ничего в служебном раунде-перетанцовке", () => {
    const skipped = rolesNotNeedingJudging({ LEADER: 3, FOLLOWER: 0 }, 2, false, "TIE_BREAK");
    expect(skipped.size).toBe(0);
  });

  it("не пропускает роль, в которой участников вообще нет (нечего пропускать)", () => {
    const skipped = rolesNotNeedingJudging({ LEADER: 0, FOLLOWER: 9 }, 6, false, null);
    expect(skipped.has("LEADER")).toBe(false);
  });

  it("ровное равенство (участников столько же, сколько мест) тоже пропускается", () => {
    const skipped = rolesNotNeedingJudging({ LEADER: 6, FOLLOWER: 9 }, 6, false, null);
    expect(skipped.has("LEADER")).toBe(true);
  });
});

describe("maybeCalculateOnEntryInTx() — роль без отсева не требует оценок судей", () => {
  it("считает required только по ведомым, если ведущих не больше мест (раунд не финал)", async () => {
    txRoundFindUniqueOrThrow.mockResolvedValue(baseRound); // finalistsCount: 10
    txRoundCount.mockResolvedValue(1); // есть более поздний раунд дивизиона — это не финал
    const leaders = Array.from({ length: 3 }, (_, i) => ({ id: `l${i}`, role: "LEADER" as const }));
    const followers = Array.from({ length: 12 }, (_, i) => ({ id: `f${i}`, role: "FOLLOWER" as const }));
    txHeatFindMany.mockResolvedValue([{ draws: [{ participants: [...leaders, ...followers] }] }]);
    txJudgeAssignmentFindMany.mockResolvedValue([{ role: "LEADER" }, { role: "FOLLOWER" }]);
    txJudgeScoreCount.mockResolvedValue(0);

    await maybeCalculateOnEntryInTx(fakeTx as never, "round1", actor);

    // required > 0 (ведомые) — раунд не завершается сразу же.
    expect(txRoundResultCreateMany).not.toHaveBeenCalled();
    const countArgs = txJudgeScoreCount.mock.calls.at(-1)![0] as { where: { drawParticipantId: { in: string[] } } };
    const ids = countArgs.where.drawParticipantId.in;
    expect(ids).toHaveLength(12);
    expect(ids.every((id) => id.startsWith("f"))).toBe(true);
  });

  it("завершает раунд автоматически (все ADVANCED), если оценивать вообще нечего — все роли <= мест", async () => {
    txRoundFindUniqueOrThrow.mockResolvedValue(baseRound); // finalistsCount: 10
    txRoundCount.mockResolvedValue(1); // не финал
    txRoundResultCount.mockResolvedValue(0);
    const leaders = Array.from({ length: 3 }, (_, i) => participant(`L${i}`, "LEADER", []));
    txHeatFindMany.mockResolvedValue([{ draws: [{ participants: leaders }] }]);
    txJudgeAssignmentFindMany.mockResolvedValue([{ role: "LEADER" }]);

    await maybeCalculateOnEntryInTx(fakeTx as never, "round1", actor);

    expect(txRoundResultCreateMany).toHaveBeenCalled();
    const rows = txRoundResultCreateMany.mock.calls[0][0].data as { status: string }[];
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.status === "ADVANCED")).toBe(true);
  });

  it("НЕ пропускает роль в финале — судьи оценивают, даже если участников <= мест", async () => {
    txRoundFindUniqueOrThrow.mockResolvedValue(baseRound);
    txRoundCount.mockResolvedValue(0); // нет более поздних раундов дивизиона — это финал
    const leaders = [
      { id: "l0", role: "LEADER" as const },
      { id: "l1", role: "LEADER" as const },
    ];
    txHeatFindMany.mockResolvedValue([{ draws: [{ participants: leaders }] }]);
    txJudgeAssignmentFindMany.mockResolvedValue([{ role: "LEADER" }]);
    txJudgeScoreCount.mockResolvedValue(0);

    await maybeCalculateOnEntryInTx(fakeTx as never, "round1", actor);

    // required = 2 (не 0) — раунд ждёт реальных оценок судьи, а не проходит автоматически.
    expect(txRoundResultCreateMany).not.toHaveBeenCalled();
  });
});

describe("maybeCalculateOnEntryInTx()", () => {
  it("завершает раунд сразу, если требуемых оценок 0 (напр. заходов вообще не было)", async () => {
    txRoundFindUniqueOrThrow.mockResolvedValue(baseRound);
    txHeatFindMany.mockResolvedValue([]); // нет участников — ни считать, ни ждать нечего
    txRoundResultCount.mockResolvedValue(0);

    await maybeCalculateOnEntryInTx(fakeTx as never, "round1", actor);

    expect(txRoundUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "COMPLETED" }) })
    );
  });

  it("ничего не делает, если требуются реальные оценки", async () => {
    txRoundFindUniqueOrThrow.mockResolvedValue(baseRound);
    txHeatFindMany.mockResolvedValueOnce([{ draws: [{ participants: [{ id: "p1", role: "LEADER" }] }] }]);
    txJudgeAssignmentFindMany.mockResolvedValue([{ role: "LEADER" }]);
    txJudgeScoreCount.mockResolvedValue(0);

    await maybeCalculateOnEntryInTx(fakeTx as never, "round1", actor);

    expect(txRoundResultCreateMany).not.toHaveBeenCalled();
  });
});

describe("recordTieBreakDecision()", () => {
  const tieBreakRound = {
    id: "tb1",
    type: "TIE_BREAK",
    status: "SCORING",
    finalistsCount: 2,
    tieBreakOfRoundId: "round1",
    tieBreakOfRound: { id: "round1" },
    division: { competitionId: "comp1" },
  };

  const drawParticipants = [
    { registrationId: "reg-L9", role: "LEADER", scored: true },
    { registrationId: "reg-L10", role: "LEADER", scored: true },
    { registrationId: "reg-L11", role: "LEADER", scored: true },
    { registrationId: "reg-helper1", role: "FOLLOWER", scored: false },
  ];

  beforeEach(() => {
    txRoundFindUniqueOrThrow.mockResolvedValue(tieBreakRound);
    prismaHeatFindFirstOrThrow.mockResolvedValue({ id: "tbHeat1" });
    prismaDrawFindFirstOrThrow.mockResolvedValue({ participants: drawParticipants });
  });

  it("отклоняет, если выбрано не ровно finalistsCount человек", async () => {
    await expect(recordTieBreakDecision("tb1", ["reg-L9"])).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it("отклоняет, если раунд ещё не в SCORING", async () => {
    txRoundFindUniqueOrThrow.mockResolvedValue({ ...tieBreakRound, status: "RUNNING" });

    await expect(recordTieBreakDecision("tb1", ["reg-L9", "reg-L10"])).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it("отклоняет, если в списке прошедших есть человек не из перетанцовки (напр. помощник)", async () => {
    await expect(recordTieBreakDecision("tb1", ["reg-L9", "reg-outsider"])).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it("отмечает выбранных ADVANCED, остальных реальных участников ELIMINATED — и в перетанцовке, и в родительском раунде", async () => {
    await recordTieBreakDecision("tb1", ["reg-L9", "reg-L10"]);

    const parentUpdates = txRoundResultUpdate.mock.calls.map((c) => c[0]);
    expect(parentUpdates).toContainEqual({ where: { roundId_registrationId: { roundId: "round1", registrationId: "reg-L9" } }, data: { status: "ADVANCED" } });
    expect(parentUpdates).toContainEqual({ where: { roundId_registrationId: { roundId: "round1", registrationId: "reg-L10" } }, data: { status: "ADVANCED" } });
    expect(parentUpdates).toContainEqual({ where: { roundId_registrationId: { roundId: "round1", registrationId: "reg-L11" } }, data: { status: "ELIMINATED" } });
    // помощник (scored=false) не входит в решение вовсе
    expect(parentUpdates.some((u) => u.where.roundId_registrationId.registrationId === "reg-helper1")).toBe(false);
  });

  it("переводит саму перетанцовку в COMPLETED", async () => {
    await recordTieBreakDecision("tb1", ["reg-L9", "reg-L10"]);

    expect(txRoundUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "tb1" }, data: expect.objectContaining({ status: "COMPLETED" }) })
    );
  });

  it("завершает родительский раунд, если других незавершённых перетанцовок не осталось", async () => {
    txRoundCount.mockResolvedValue(0);
    txRoundFindUniqueOrThrow.mockImplementation(async (args: { where: { id: string } }) =>
      args.where.id === "round1" ? { id: "round1", status: "SCORING", statusVersion: 3 } : tieBreakRound
    );

    await recordTieBreakDecision("tb1", ["reg-L9", "reg-L10"]);

    expect(txRoundUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "round1", status: "SCORING", statusVersion: 3 }, data: expect.objectContaining({ status: "COMPLETED" }) })
    );
  });

  it("НЕ завершает родительский раунд, если есть другая нерешённая перетанцовка (напр. по второй роли)", async () => {
    txRoundCount.mockResolvedValue(1);

    await recordTieBreakDecision("tb1", ["reg-L9", "reg-L10"]);

    expect(txRoundUpdateMany).not.toHaveBeenCalled();
  });
});
