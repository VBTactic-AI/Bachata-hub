import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Actor } from "@/server/rbac/actor";

const requirePermissionMock = vi.fn();
vi.mock("@/server/rbac/authorize", () => ({ requirePermission: (...a: unknown[]) => requirePermissionMock(...a) }));

const fillHelperShortageMock = vi.fn();
// CODE-002: alreadyScoredElsewhereInRound остаётся настоящей реализацией —
// см. tests/judging/advancement.test.ts.
vi.mock("@/server/competition/draw-engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/competition/draw-engine")>();
  return { ...actual, fillHelperShortage: (...a: unknown[]) => fillHelperShortageMock(...a) };
});

const txRoundFindUniqueOrThrow = vi.fn();
const txRoundFindMany = vi.fn();
const txRoundCreate = vi.fn();
const txRoundUpdate = vi.fn();
const txRoundUpdateMany = vi.fn();
const txRoundCount = vi.fn();
const txHeatFindMany = vi.fn();
const txHeatCreate = vi.fn();
const txDrawCreate = vi.fn();
const txDrawParticipantCreateMany = vi.fn();
const txFinalResultCount = vi.fn();
const txFinalResultCreateMany = vi.fn();
const txFinalResultUpdate = vi.fn();
const txFinalResultUpsert = vi.fn();
const txFinalSessionUpdate = vi.fn();
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
  drawParticipant: { createMany: txDrawParticipantCreateMany },
  finalResult: { count: txFinalResultCount, createMany: txFinalResultCreateMany, update: txFinalResultUpdate, upsert: txFinalResultUpsert },
  finalSession: { update: txFinalSessionUpdate },
  auditLog: { create: auditCreate },
};

const prismaTransaction = vi.fn((fn: (tx: typeof fakeTx) => unknown) => fn(fakeTx));
const prismaRoundFindUniqueOrThrow = vi.fn();
const prismaHeatFindFirstOrThrow = vi.fn();
const prismaDrawFindFirstOrThrow = vi.fn();
const prismaFinalResultFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    round: { findUniqueOrThrow: prismaRoundFindUniqueOrThrow },
    heat: { findFirstOrThrow: prismaHeatFindFirstOrThrow },
    draw: { findFirstOrThrow: prismaDrawFindFirstOrThrow },
    finalResult: { findMany: prismaFinalResultFindMany },
    $transaction: (fn: (tx: typeof fakeTx) => unknown) => prismaTransaction(fn),
  },
}));

const { calculateFinalResultsInTx, recordFinalTieBreakDecision } = await import("@/server/judging/final-advancement");
const { ValidationFailedError, ConcurrentModificationError } = await import("@/server/errors");

const actor: Actor = { userId: "judge1", email: "j@b.by", globalPermissions: new Set(), permissionsByCompetition: new Map() };

// Приоритет: tech=1, musicality=2 — как в промте пользователя.
const CRITERIA = [
  { id: "tech", name: "Техника", priority: 1, minScore: 0, maxScore: 10, step: 1 },
  { id: "mus", name: "Музыкальность", priority: 2, minScore: 0, maxScore: 10, step: 1 },
];

const baseRound = {
  id: "final1",
  order: 5,
  divisionId: "div1",
  rulesId: "rules1",
  statusVersion: 1,
  status: "SCORING",
  type: null,
  finalSession: { id: "session1", criteriaSnapshot: CRITERIA },
  division: { id: "div1", competitionId: "comp1", category: { order: 3 } },
};

function participant(registrationId: string, role: "LEADER" | "FOLLOWER", tech: number, mus: number) {
  return {
    registrationId,
    role,
    finalJudgeScores: [
      { criterionId: "tech", value: tech },
      { criterionId: "mus", value: mus },
    ],
  };
}

beforeEach(() => {
  requirePermissionMock.mockReset().mockResolvedValue(actor);
  fillHelperShortageMock.mockReset().mockResolvedValue([]);
  txRoundFindUniqueOrThrow.mockReset().mockResolvedValue(baseRound);
  txRoundFindMany.mockReset().mockResolvedValue([]);
  txRoundCreate.mockReset().mockResolvedValue({ id: "tb1" });
  txRoundUpdate.mockReset();
  txRoundUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  txRoundCount.mockReset().mockResolvedValue(0);
  txHeatFindMany.mockReset().mockResolvedValue([]);
  txHeatCreate.mockReset().mockResolvedValue({ id: "tbHeat1" });
  txDrawCreate.mockReset().mockResolvedValue({ id: "tbDraw1" });
  txDrawParticipantCreateMany.mockReset();
  txFinalResultCount.mockReset().mockResolvedValue(0);
  txFinalResultCreateMany.mockReset();
  txFinalResultUpdate.mockReset();
  txFinalResultUpsert.mockReset();
  txFinalSessionUpdate.mockReset();
  auditCreate.mockReset();
  prismaTransaction.mockClear();
  prismaRoundFindUniqueOrThrow.mockReset();
  prismaHeatFindFirstOrThrow.mockReset();
  prismaDrawFindFirstOrThrow.mockReset();
  prismaFinalResultFindMany.mockReset();
});

describe("calculateFinalResultsInTx() — базовые случаи", () => {
  it("ничего не делает, если результат уже посчитан (идемпотентность)", async () => {
    txFinalResultCount.mockResolvedValue(3);
    await calculateFinalResultsInTx(fakeTx as never, "final1", actor);
    expect(txFinalResultCreateMany).not.toHaveBeenCalled();
    expect(txRoundFindUniqueOrThrow).not.toHaveBeenCalled();
  });

  it("не считает служебные раунды-перетанцовки автоматически", async () => {
    txRoundFindUniqueOrThrow.mockResolvedValue({ ...baseRound, type: "TIE_BREAK" });
    await calculateFinalResultsInTx(fakeTx as never, "final1", actor);
    expect(txFinalResultCreateMany).not.toHaveBeenCalled();
  });

  it("ничего не делает, если у раунда ещё не начат финал (нет FinalSession)", async () => {
    txRoundFindUniqueOrThrow.mockResolvedValue({ ...baseRound, finalSession: null });
    await calculateFinalResultsInTx(fakeTx as never, "final1", actor);
    expect(txFinalResultCreateMany).not.toHaveBeenCalled();
  });

  // JUDGES_DANCE создаёт заходы стадий по одному — судьи могут полностью
  // оценить стадию 1, пока раунд ещё RUNNING (стадия 2 ещё не создана).
  // Без этой проверки был бы посчитан результат только по одной роли, а
  // идемпотентная защита не дала бы пересчитать его правильно позже
  // (найдено вживую, 2026-09-04).
  it("НЕ считает результат, если раунд ещё не вошёл в SCORING (даже если все текущие заходы полностью оценены)", async () => {
    txRoundFindUniqueOrThrow.mockResolvedValue({ ...baseRound, status: "RUNNING" });
    txHeatFindMany.mockResolvedValue([{ draws: [{ participants: [participant("regA", "LEADER", 100, 150)] }] }]);
    await calculateFinalResultsInTx(fakeTx as never, "final1", actor);
    expect(txFinalResultCreateMany).not.toHaveBeenCalled();
  });
});

describe("calculateFinalResultsInTx() — сумма + лексикографический tie-break (промт пользователя)", () => {
  it("A(tech100,mus150)=250 vs B(tech99,mus151)=250 — Technique (приоритет #1) решает, несмотря на то что Musicality у B выше", async () => {
    const a = participant("regA", "LEADER", 100, 150);
    const b = participant("regB", "LEADER", 99, 151);
    txHeatFindMany.mockResolvedValue([{ draws: [{ participants: [a, b] }] }]);

    await calculateFinalResultsInTx(fakeTx as never, "final1", actor);

    const rows: { registrationId: string; place: number | null }[] = txFinalResultCreateMany.mock.calls[0][0].data;
    expect(rows.find((r) => r.registrationId === "regA")?.place).toBe(1);
    expect(rows.find((r) => r.registrationId === "regB")?.place).toBe(2);
    // Ничьей нет — раунд завершается сразу.
    expect(txRoundUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "COMPLETED" }) }));
    expect(txFinalSessionUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "session1" } }));
  });

  it("роли ранжируются отдельно — ведущий и ведомый с одинаковой суммой не смешиваются в одну tie-группу", async () => {
    const leader = participant("regL", "LEADER", 50, 50);
    const follower = participant("regF", "FOLLOWER", 50, 50);
    txHeatFindMany.mockResolvedValue([{ draws: [{ participants: [leader, follower] }] }]);

    await calculateFinalResultsInTx(fakeTx as never, "final1", actor);

    const rows: { registrationId: string; role: string; place: number | null }[] = txFinalResultCreateMany.mock.calls[0][0].data;
    expect(rows.find((r) => r.registrationId === "regL")?.place).toBe(1);
    expect(rows.find((r) => r.registrationId === "regF")?.place).toBe(1);
    expect(txRoundCreate).not.toHaveBeenCalled(); // ни одна роль не дала полную ничью
  });

  it("полная ничья (сумма и все критерии совпали) создаёт TIE_BREAK-раунд, не выбирает место сама", async () => {
    const a = participant("regA", "LEADER", 100, 150);
    const b = participant("regB", "LEADER", 100, 150);
    const clean = participant("regC", "LEADER", 200, 200);
    txHeatFindMany.mockResolvedValue([{ draws: [{ participants: [a, b, clean] }] }]);

    await calculateFinalResultsInTx(fakeTx as never, "final1", actor);

    const rows: { registrationId: string; place: number | null; tieGroupKey: string | null }[] = txFinalResultCreateMany.mock.calls[0][0].data;
    expect(rows.find((r) => r.registrationId === "regC")?.place).toBe(1); // явный лидер — место сразу
    expect(rows.find((r) => r.registrationId === "regA")?.place).toBeNull();
    expect(rows.find((r) => r.registrationId === "regB")?.place).toBeNull();
    expect(rows.find((r) => r.registrationId === "regA")?.tieGroupKey).toBe(rows.find((r) => r.registrationId === "regB")?.tieGroupKey);

    // Создан служебный раунд-перетанцовка с сохранённым ключом tie-группы.
    expect(txRoundCreate).toHaveBeenCalledTimes(1);
    const createCall = txRoundCreate.mock.calls[0][0];
    expect(createCall.data.type).toBe("TIE_BREAK");
    expect(createCall.data.tieBreakOfRoundId).toBe("final1");
    expect(createCall.data.config.finalTieGroupRole).toBe("LEADER");

    // Родитель НЕ завершается, пока перетанцовка не разрешена.
    expect(txRoundUpdateMany).not.toHaveBeenCalled();
    expect(txFinalSessionUpdate).not.toHaveBeenCalled();
  });
});

describe("recordFinalTieBreakDecision() — RANK_ALL, коллегиальное решение", () => {
  const tieBreakRound = {
    id: "tb1",
    type: "TIE_BREAK" as const,
    status: "SCORING" as const,
    statusVersion: 7,
    config: { finalTieGroupKey: "tie-2-4", finalTieGroupRole: "LEADER" as const, finalTieGroupStartPlace: 2 },
    division: { competitionId: "comp1" },
    tieBreakOfRound: { ...baseRound, id: "final1" },
  };

  beforeEach(() => {
    prismaRoundFindUniqueOrThrow.mockResolvedValue(tieBreakRound);
    prismaFinalResultFindMany.mockResolvedValue([
      { registrationId: "regA", totalScore: 250, criteriaTotals: { tech: 100, mus: 150 } },
      { registrationId: "regB", totalScore: 250, criteriaTotals: { tech: 100, mus: 150 } },
    ]);
    prismaHeatFindFirstOrThrow.mockResolvedValue({ id: "tbHeat1" });
    prismaDrawFindFirstOrThrow.mockResolvedValue({
      participants: [
        { registrationId: "regA", scored: true },
        { registrationId: "regB", scored: true },
        { registrationId: "helperX", scored: false },
      ],
    });
  });

  it("присваивает места по указанному судьями порядку, начиная со startPlace группы", async () => {
    await recordFinalTieBreakDecision("tb1", ["regB", "regA"]);

    expect(txFinalResultUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { roundId_registrationId: { roundId: "final1", registrationId: "regB" } }, data: expect.objectContaining({ place: 2 }) })
    );
    expect(txFinalResultUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { roundId_registrationId: { roundId: "final1", registrationId: "regA" } }, data: expect.objectContaining({ place: 3 }) })
    );
    // Сама перетанцовка завершена (DB-001: с проверкой statusVersion, не голым update).
    expect(txRoundUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "tb1", status: "SCORING", statusVersion: 7 },
        data: expect.objectContaining({ status: "COMPLETED" }),
      })
    );
  });

  it("отклоняет, если перетанцовка уже была решена кем-то другим (statusVersion не совпал)", async () => {
    txRoundUpdateMany.mockResolvedValue({ count: 0 });

    await expect(recordFinalTieBreakDecision("tb1", ["regB", "regA"])).rejects.toBeInstanceOf(ConcurrentModificationError);
  });

  it("завершает родительский раунд, если это была последняя нерешённая tie-группа", async () => {
    txRoundCount.mockResolvedValue(0); // нет других нерешённых перетанцовок
    txFinalResultCount.mockResolvedValue(0); // нет других незакрытых групп (place=null)

    await recordFinalTieBreakDecision("tb1", ["regA", "regB"]);

    expect(txRoundUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "COMPLETED" }) }));
    expect(txFinalSessionUpdate).toHaveBeenCalled();
  });

  it("НЕ завершает родительский раунд, если остаётся другая нерешённая tie-группа", async () => {
    txRoundCount.mockResolvedValue(1); // есть ещё одна нерешённая перетанцовка (напр. по FOLLOWER)

    await recordFinalTieBreakDecision("tb1", ["regA", "regB"]);

    // Сама перетанцовка (tb1) всё равно завершается (DB-001) — не завершается
    // только РОДИТЕЛЬСКИЙ раунд (final1).
    expect(txRoundUpdateMany).toHaveBeenCalledTimes(1);
    expect(txRoundUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "tb1" }) }));
  });

  it("отклоняет решение с составом, не совпадающим с реальной tie-группой", async () => {
    await expect(recordFinalTieBreakDecision("tb1", ["regA", "someoneElse"])).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it("отклоняет решение, если раунд ещё не в статусе SCORING", async () => {
    prismaRoundFindUniqueOrThrow.mockResolvedValue({ ...tieBreakRound, status: "RUNNING" });
    await expect(recordFinalTieBreakDecision("tb1", ["regA", "regB"])).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it("отклоняет решение для перетанцовки обычного (не финального) раунда", async () => {
    prismaRoundFindUniqueOrThrow.mockResolvedValue({ ...tieBreakRound, tieBreakOfRound: { ...baseRound, id: "final1", finalSession: null } });
    await expect(recordFinalTieBreakDecision("tb1", ["regA", "regB"])).rejects.toBeInstanceOf(ValidationFailedError);
  });
});
