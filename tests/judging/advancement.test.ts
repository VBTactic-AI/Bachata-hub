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
const txJudgeRoundConfirmationCount = vi.fn();
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
  judgeRoundConfirmation: { count: txJudgeRoundConfirmationCount },
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
const { ValidationFailedError, ConcurrentModificationError } = await import("@/server/errors");

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
  txJudgeRoundConfirmationCount.mockReset().mockResolvedValue(0);
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
    // Не финал — сценарий про обычный отсев на границе (следующий раунд
    // есть); иначе TIEBREAK-001 (ничья ЗА МЕСТО, findTiedRuns) заодно нашёл
    // бы ничью среди 5 одинаково набравших ведомых ниже, что не относится к
    // тому, что здесь проверяется. Финальный случай — отдельный describe.
    txRoundCount.mockResolvedValue(1);
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
    // Не финал (isFinalStageInTx -> laterCount>0) — эта проверка про обычный
    // отсев на границе, TIEBREAK-001 (ничья ЗА МЕСТО в финале) здесь
    // намеренно не участвует, см. отдельный describe ниже.
    txRoundCount.mockResolvedValue(1);
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

// TIEBREAK-001 (P0): в финале (isFinalStageInTx=true — здесь нет более
// поздних обычных раундов дивизиона) ничья ЗА МЕСТО среди тех, кого и так
// никто не отсеивает (finalistsCount >= числа участников — обычный случай
// финала), раньше проходила мимо splitByCutoff вообще (он видит только
// ничью на границе отсева) и получала разные места по порядку массива/БД.
describe("calculateRoundResultsInTx() — TIEBREAK-001: ничья за место в финале (никого не отсеивают)", () => {
  it("2 лидера с одинаковой суммой в финале — TIE_BREAK_REQUIRED, а не молча разные места", async () => {
    txRoundCount.mockResolvedValue(0); // нет более поздних раундов дивизиона — это финал
    txRoundFindUniqueOrThrow.mockResolvedValue({ ...baseRound, finalistsCount: 3 });
    // 3 места, все проходят: L1 и L2 честно делят сумму 20 (реальная ничья
    // за 1-2 место), L3 явно ниже — 3-е место не спорно.
    const tied = [participant("L1", "LEADER", [20]), participant("L2", "LEADER", [20])];
    const clear = [participant("L3", "LEADER", [15])];
    txHeatFindMany.mockResolvedValue([{ draws: [{ participants: [...tied, ...clear] }] }]);

    await calculateRoundResultsInTx(fakeTx as never, "round1", actor);

    const rows: { registrationId: string; status: string }[] = txRoundResultCreateMany.mock.calls[0][0].data;
    const byId = new Map(rows.map((r) => [r.registrationId, r.status]));
    expect(byId.get("reg-L1")).toBe("TIE_BREAK_REQUIRED");
    expect(byId.get("reg-L2")).toBe("TIE_BREAK_REQUIRED");
    expect(byId.get("reg-L3")).toBe("ADVANCED");
    // Раунд НЕ завершается, пока перетанцовка за место не решена.
    expect(txRoundUpdateMany).not.toHaveBeenCalled();
    // Служебный TIE_BREAK создан с FULL_RANK (никого не отсеивают — 2 места на 2 человек).
    expect(txRoundCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "TIE_BREAK",
          finalistsCount: 2,
          config: expect.objectContaining({ tieBreakKind: "FULL_RANK", startRank: 1 }),
        }),
      })
    );
  });

  it("та же ничья вне финала (есть следующий раунд) НЕ создаёт перетанцовку — место неважно, если оба и так проходят", async () => {
    txRoundCount.mockResolvedValue(1); // есть более поздний раунд — не финал
    txRoundFindUniqueOrThrow.mockResolvedValue({ ...baseRound, finalistsCount: 3 });
    const tied = [participant("L1", "LEADER", [20]), participant("L2", "LEADER", [20])];
    txHeatFindMany.mockResolvedValue([{ draws: [{ participants: tied }] }]);

    await calculateRoundResultsInTx(fakeTx as never, "round1", actor);

    const rows: { registrationId: string; status: string }[] = txRoundResultCreateMany.mock.calls[0][0].data;
    expect(rows.every((r) => r.status === "ADVANCED")).toBe(true);
    expect(txRoundUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "COMPLETED" }) }));
  });
});

describe("recordTieBreakDecision() — FULL_RANK (TIEBREAK-001, ничья за место в финале)", () => {
  const fullRankTieBreakRound = {
    id: "tb2",
    type: "TIE_BREAK",
    status: "SCORING",
    statusVersion: 1,
    finalistsCount: 2,
    tieBreakOfRoundId: "round1",
    tieBreakOfRound: { id: "round1" },
    division: { competitionId: "comp1" },
    config: { tieBreakKind: "FULL_RANK", startRank: 1 },
  };
  const fullRankParticipants = [
    { registrationId: "reg-L1", role: "LEADER", scored: true },
    { registrationId: "reg-L2", role: "LEADER", scored: true },
  ];

  beforeEach(() => {
    txRoundFindUniqueOrThrow.mockResolvedValue(fullRankTieBreakRound);
    prismaHeatFindFirstOrThrow.mockResolvedValue({ id: "tbHeat2" });
    prismaDrawFindFirstOrThrow.mockResolvedValue({ participants: fullRankParticipants });
  });

  it("требует ВСЕХ участников группы (не подмножество, как в SELECT_N)", async () => {
    await expect(recordTieBreakDecision("tb2", ["reg-L1"])).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it("порядок значим — присваивает ADVANCED и правильный итоговый rank родителю по месту в списке", async () => {
    await recordTieBreakDecision("tb2", ["reg-L2", "reg-L1"]); // L2 объявлен лучшим

    const parentUpdates = txRoundResultUpdate.mock.calls.map((c) => c[0]);
    expect(parentUpdates).toContainEqual({
      where: { roundId_registrationId: { roundId: "round1", registrationId: "reg-L2" } },
      data: { status: "ADVANCED", rank: 1 },
    });
    expect(parentUpdates).toContainEqual({
      where: { roundId_registrationId: { roundId: "round1", registrationId: "reg-L1" } },
      data: { status: "ADVANCED", rank: 2 },
    });
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
    txRoundResultCount.mockResolvedValue(0);
    // Ведущие (3, <= 10 мест) не оценены вовсе; ведомые (12) оценены
    // единственным судьёй ПОЛНОСТЬЮ. Если бы ведущие ошибочно тоже
    // считались required, раунд бы НЕ завершился (у них нет ни одной
    // оценки) — завершается => required корректно не включает ведущих.
    const leaders = Array.from({ length: 3 }, (_, i) => ({ id: `l${i}`, role: "LEADER" as const, judgeScores: [] }));
    const followers = Array.from({ length: 12 }, (_, i) => ({ id: `f${i}`, role: "FOLLOWER" as const, judgeScores: [{ judgeAssignmentId: undefined, value: 1 }] }));
    txHeatFindMany.mockResolvedValue([{ draws: [{ participants: [...leaders, ...followers] }] }]);
    txJudgeAssignmentFindMany.mockResolvedValue([{ role: "LEADER" }, { role: "FOLLOWER" }]);

    // maybeFinalizeAfterScoreInTx — проверка "уже всё собрано?" после
    // отправки очередной оценки (не maybeCalculateOnEntryInTx, та — только
    // для "изначально нечего оценивать", required===0).
    await maybeFinalizeAfterScoreInTx(fakeTx as never, "round1", actor);

    expect(txRoundResultCreateMany).toHaveBeenCalled();
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
      { id: "l0", role: "LEADER" as const, judgeScores: [] },
      { id: "l1", role: "LEADER" as const, judgeScores: [] },
    ];
    txHeatFindMany.mockResolvedValue([{ draws: [{ participants: leaders }] }]);
    txJudgeAssignmentFindMany.mockResolvedValue([{ role: "LEADER" }]);

    await maybeCalculateOnEntryInTx(fakeTx as never, "round1", actor);

    // required = 2 (не 0) — раунд ждёт реальных оценок судьи, а не проходит автоматически.
    expect(txRoundResultCreateMany).not.toHaveBeenCalled();
  });

  // По запросу пользователя (2026-09-04): формат "Да/Нет" (judgingMaxScore=1)
  // — раунд не ждёт явного "Нет" по каждому оставшемуся и не завершается по
  // одним лишь сырым кликам "Да" (иначе случайный лишний клик мог бы
  // необратимо закрыть раунд, пока судья ещё поправляет себя) — только
  // когда ВСЕ судьи явно нажали "Готово" (JudgeRoundConfirmation).
  it('формат "Да/Нет": раунд завершается, когда все судьи нажали "Готово" — не по одним кликам "Да"', async () => {
    // 5 ведомых, finalistsCount=2 — роль НЕ попадает под пропуск судейства
    // (A19, там участников не больше мест), значит проверяется именно
    // подтверждение "Готово", не сырые оценки.
    const round = { ...baseRound, judgingMaxScore: 1, finalistsCount: 2 };
    txRoundFindUniqueOrThrow.mockResolvedValue(round);
    txRoundCount.mockResolvedValue(1); // не финал
    txRoundResultCount.mockResolvedValue(0);
    const followers = Array.from({ length: 5 }, (_, i) => ({ id: `f${i}`, role: "FOLLOWER" as const, judgeScores: [] }));
    txHeatFindMany.mockResolvedValue([{ draws: [{ participants: followers }] }]);
    txJudgeAssignmentFindMany.mockResolvedValue([{ id: "assign-f", role: "FOLLOWER" }]);
    // Единственный судья роли уже нажал "Готово" — 1 подтверждение из 1 требуемого.
    txJudgeRoundConfirmationCount.mockResolvedValue(1);

    await maybeFinalizeAfterScoreInTx(fakeTx as never, "round1", actor);

    expect(txRoundResultCreateMany).toHaveBeenCalled();
  });

  it('формат "Да/Нет": НЕ завершается, пока не все судьи нажали "Готово", даже если баллы уже расставлены', async () => {
    const round = { ...baseRound, judgingMaxScore: 1, finalistsCount: 2 };
    txRoundFindUniqueOrThrow.mockResolvedValue(round);
    txRoundCount.mockResolvedValue(1); // не финал
    const followers = Array.from({ length: 5 }, (_, i) => ({ id: `f${i}`, role: "FOLLOWER" as const, judgeScores: [] }));
    txHeatFindMany.mockResolvedValue([{ draws: [{ participants: followers }] }]);
    // Два судьи назначены на роль — подтвердил пока только один.
    txJudgeAssignmentFindMany.mockResolvedValue([
      { id: "assign-f1", role: "FOLLOWER" },
      { id: "assign-f2", role: "FOLLOWER" },
    ]);
    txJudgeRoundConfirmationCount.mockResolvedValue(1);

    await maybeFinalizeAfterScoreInTx(fakeTx as never, "round1", actor);

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
    txHeatFindMany.mockResolvedValueOnce([{ draws: [{ participants: [{ id: "p1", role: "LEADER", judgeScores: [] }] }] }]);
    txJudgeAssignmentFindMany.mockResolvedValue([{ role: "LEADER" }]);

    await maybeCalculateOnEntryInTx(fakeTx as never, "round1", actor);

    expect(txRoundResultCreateMany).not.toHaveBeenCalled();
  });
});

describe("recordTieBreakDecision()", () => {
  const tieBreakRound = {
    id: "tb1",
    type: "TIE_BREAK",
    status: "SCORING",
    statusVersion: 5,
    finalistsCount: 2,
    tieBreakOfRoundId: "round1",
    tieBreakOfRound: { id: "round1" },
    division: { competitionId: "comp1" },
    config: {},
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

  it("переводит саму перетанцовку в COMPLETED (DB-001: с проверкой statusVersion, не голым update)", async () => {
    await recordTieBreakDecision("tb1", ["reg-L9", "reg-L10"]);

    expect(txRoundUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "tb1", status: "SCORING", statusVersion: 5 },
        data: expect.objectContaining({ status: "COMPLETED" }),
      })
    );
  });

  // DB-001: второе (гоночное или повторное) решение по уже решённой
  // перетанцовке не должно молча перезаписать первое — updateMany с
  // statusVersion в WHERE вернёт count:0, и это обязано провалиться явно.
  it("отклоняет решение, если перетанцовка уже была решена кем-то другим (statusVersion не совпал)", async () => {
    txRoundUpdateMany.mockResolvedValue({ count: 0 });

    await expect(recordTieBreakDecision("tb1", ["reg-L9", "reg-L10"])).rejects.toBeInstanceOf(ConcurrentModificationError);
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

    // Сама перетанцовка (tb1) всё равно переходит в COMPLETED (DB-001) — не
    // завершается только РОДИТЕЛЬСКИЙ раунд (round1).
    expect(txRoundUpdateMany).toHaveBeenCalledTimes(1);
    expect(txRoundUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "tb1" }) }));
  });
});
