import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Actor } from "@/server/rbac/actor";

const requirePermissionMock = vi.fn();
vi.mock("@/server/rbac/authorize", () => ({ requirePermission: (...a: unknown[]) => requirePermissionMock(...a) }));

const divisionFindUniqueOrThrow = vi.fn();
const divisionFindMany = vi.fn();
const resultCount = vi.fn();
const resultFindUniqueOrThrow = vi.fn();
const resultFindMany = vi.fn();
const roundFindMany = vi.fn();

const txResultCreateMany = vi.fn();
const txResultUpdateMany = vi.fn();
const txResultFindFirstOrThrow = vi.fn();
const txResultCreate = vi.fn();
const txDivisionUpdate = vi.fn();
const txCompetitionUpdate = vi.fn();
const txAuditCreate = vi.fn();
const txAuditCreateMany = vi.fn();
const txResultFindMany = vi.fn();

const fakeTx = {
  result: {
    createMany: txResultCreateMany,
    updateMany: txResultUpdateMany,
    findFirstOrThrow: txResultFindFirstOrThrow,
    create: txResultCreate,
    findMany: txResultFindMany,
  },
  division: { update: txDivisionUpdate },
  competition: { update: txCompetitionUpdate },
  auditLog: { create: txAuditCreate, createMany: txAuditCreateMany },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    division: {
      findUniqueOrThrow: (...a: unknown[]) => divisionFindUniqueOrThrow(...a), findFirstOrThrow: (...a: unknown[]) => divisionFindUniqueOrThrow(...a),
      findMany: (...a: unknown[]) => divisionFindMany(...a),
    },
    result: {
      count: (...a: unknown[]) => resultCount(...a),
      findUniqueOrThrow: (...a: unknown[]) => resultFindUniqueOrThrow(...a), findFirstOrThrow: (...a: unknown[]) => resultFindUniqueOrThrow(...a),
      findMany: (...a: unknown[]) => resultFindMany(...a),
    },
    round: { findMany: (...a: unknown[]) => roundFindMany(...a) },
    $transaction: (fn: (tx: typeof fakeTx) => unknown) => fn(fakeTx),
  },
}));

const {
  calculateResults,
  reviewResults,
  checkCompetitionResultsReadiness,
  publishCompetitionResults,
  unpublishCompetitionResults,
  correctResult,
  swapResultPlacements,
} = await import("@/server/results/results");
const { ValidationFailedError } = await import("@/server/errors");

const actor: Actor = { userId: "u1", email: "a@b.by", globalPermissions: new Set(), permissionsByCompetition: new Map() };

beforeEach(() => {
  requirePermissionMock.mockReset().mockResolvedValue(actor);
  divisionFindUniqueOrThrow.mockReset().mockResolvedValue({ id: "div1", competitionId: "comp1" });
  divisionFindMany.mockReset().mockResolvedValue([]);
  resultCount.mockReset().mockResolvedValue(0);
  resultFindUniqueOrThrow.mockReset();
  resultFindMany.mockReset().mockResolvedValue([]);
  roundFindMany.mockReset().mockResolvedValue([]);
  txResultCreateMany.mockReset();
  txResultUpdateMany.mockReset();
  txResultFindFirstOrThrow.mockReset();
  txResultCreate.mockReset().mockResolvedValue({ id: "res-new" });
  txDivisionUpdate.mockReset();
  txCompetitionUpdate.mockReset();
  txAuditCreate.mockReset();
  txAuditCreateMany.mockReset();
  txResultFindMany.mockReset().mockResolvedValue([]);
});

describe("calculateResults() — расчёт официального протокола дивизиона", () => {
  it("отклоняет, если у дивизиона нет ни одного раунда", async () => {
    roundFindMany.mockResolvedValue([]);
    await expect(calculateResults("div1")).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it("отклоняет, если финальный раунд ещё не завершён", async () => {
    roundFindMany.mockResolvedValue([{ id: "r-final", status: "SCORING", finalSession: null, results: [], finalResults: [] }]);
    await expect(calculateResults("div1")).rejects.toBeInstanceOf(ValidationFailedError);
    expect(txResultCreateMany).not.toHaveBeenCalled();
  });

  it("идемпотентно — если Result уже посчитан, повторный вызов ничего не делает", async () => {
    resultCount.mockResolvedValue(3);
    const r = await calculateResults("div1");
    expect(r.createdCount).toBe(0);
    expect(roundFindMany).not.toHaveBeenCalled();
    expect(txResultCreateMany).not.toHaveBeenCalled();
  });

  it("старая система (RoundResult): финалисты получают rank как место, выбывшие раньше — ELIMINATED без места", async () => {
    // order desc: сначала финал (r2), потом отборочный (r1)
    roundFindMany.mockResolvedValue([
      {
        id: "r2",
        status: "COMPLETED",
        finalSession: null,
        results: [
          { registrationId: "reg-a", rank: 1 },
          { registrationId: "reg-b", rank: 2 },
        ],
        finalResults: [],
      },
      {
        id: "r1",
        status: "COMPLETED",
        finalSession: null,
        results: [
          { registrationId: "reg-a", rank: 1 },
          { registrationId: "reg-b", rank: 2 },
          { registrationId: "reg-c", rank: 3 }, // не дошёл до финала
        ],
        finalResults: [],
      },
    ]);

    const r = await calculateResults("div1");
    expect(r.createdCount).toBe(3);
    const rows = txResultCreateMany.mock.calls[0][0].data;
    expect(rows).toContainEqual(
      expect.objectContaining({ registrationId: "reg-a", status: "FINALIST", placement: 1, roundReachedId: "r2", version: 1 })
    );
    expect(rows).toContainEqual(
      expect.objectContaining({ registrationId: "reg-b", status: "FINALIST", placement: 2, roundReachedId: "r2" })
    );
    expect(rows).toContainEqual(
      expect.objectContaining({ registrationId: "reg-c", status: "ELIMINATED", placement: null, roundReachedId: "r1" })
    );
  });

  it("новая система финала (FinalSession): место берётся из FinalResult.place, не из RoundResult", async () => {
    roundFindMany.mockResolvedValue([
      {
        id: "r-final",
        status: "COMPLETED",
        finalSession: { id: "fs1" },
        results: [],
        finalResults: [{ registrationId: "reg-a", place: 1 }],
      },
    ]);

    await calculateResults("div1");
    const rows = txResultCreateMany.mock.calls[0][0].data;
    expect(rows).toEqual([
      expect.objectContaining({ registrationId: "reg-a", status: "FINALIST", placement: 1, roundReachedId: "r-final" }),
    ]);
  });

  it("проверяет право result:calculate в рамках competitionId дивизиона", async () => {
    roundFindMany.mockResolvedValue([{ id: "r1", status: "COMPLETED", finalSession: null, results: [], finalResults: [] }]);
    await calculateResults("div1");
    expect(requirePermissionMock).toHaveBeenCalledWith("result:calculate", "comp1");
  });
});

describe("reviewResults() — отметка проверки перед публикацией", () => {
  it("отклоняет, если результаты ещё не рассчитаны", async () => {
    resultCount.mockResolvedValue(0);
    await expect(reviewResults("div1")).rejects.toBeInstanceOf(ValidationFailedError);
    expect(txDivisionUpdate).not.toHaveBeenCalled();
  });

  it("отмечает дивизион проверенным и пишет audit", async () => {
    resultCount.mockResolvedValue(2);
    await reviewResults("div1");
    expect(txDivisionUpdate).toHaveBeenCalledWith({
      where: { id: "div1" },
      data: expect.objectContaining({ resultsReviewedById: "u1" }),
    });
    expect(txAuditCreate.mock.calls[0][0].data.action).toBe("result.review");
  });
});

describe("checkCompetitionResultsReadiness() — список проблем целиком", () => {
  it("сообщает про каждый неготовый дивизион отдельно", async () => {
    divisionFindMany.mockResolvedValue([
      { id: "d1", resultsReviewedAt: null, category: { name: "Без раундов" }, rounds: [], _count: { results: 0 } },
      {
        id: "d2",
        resultsReviewedAt: null,
        category: { name: "Не завершён" },
        rounds: [{ status: "SCORING" }],
        _count: { results: 0 },
      },
      {
        id: "d3",
        resultsReviewedAt: null,
        category: { name: "Не рассчитан" },
        rounds: [{ status: "COMPLETED" }],
        _count: { results: 0 },
      },
      {
        id: "d4",
        resultsReviewedAt: null,
        category: { name: "Не проверен" },
        rounds: [{ status: "COMPLETED" }],
        _count: { results: 4 },
      },
      {
        id: "d5",
        resultsReviewedAt: new Date(),
        category: { name: "Готов" },
        rounds: [{ status: "COMPLETED" }],
        _count: { results: 4 },
      },
    ]);

    const issues = await checkCompetitionResultsReadiness("comp1");
    expect(issues).toHaveLength(4);
    expect(issues.some((i) => i.includes("Без раундов"))).toBe(true);
    expect(issues.some((i) => i.includes("Не завершён"))).toBe(true);
    expect(issues.some((i) => i.includes("Не рассчитан"))).toBe(true);
    expect(issues.some((i) => i.includes("Не проверен"))).toBe(true);
    expect(issues.some((i) => i.includes("Готов"))).toBe(false);
  });
});

describe("publishCompetitionResults() — публикация всех дивизионов соревнования разом", () => {
  it("отклоняет публикацию, пока есть хоть один неготовый дивизион", async () => {
    divisionFindMany.mockResolvedValue([
      { id: "d1", resultsReviewedAt: null, category: { name: "X" }, rounds: [], _count: { results: 0 } },
    ]);
    await expect(publishCompetitionResults("comp1")).rejects.toBeInstanceOf(ValidationFailedError);
    expect(txCompetitionUpdate).not.toHaveBeenCalled();
  });

  it("публикует только ПОСЛЕДНЮЮ версию каждого (divisionId, registrationId) и включает publicResults", async () => {
    divisionFindMany.mockResolvedValue([
      { id: "d1", resultsReviewedAt: new Date(), category: { name: "X" }, rounds: [{ status: "COMPLETED" }], _count: { results: 1 } },
    ]);
    txResultFindMany.mockResolvedValue([
      { id: "res-v1", divisionId: "d1", registrationId: "reg-a", version: 1 },
      { id: "res-v2", divisionId: "d1", registrationId: "reg-a", version: 2 },
    ]);

    const r = await publishCompetitionResults("comp1");
    expect(r.publishedCount).toBe(1);
    expect(txResultUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ["res-v2"] } },
      data: expect.objectContaining({ publishedById: "u1" }),
    });
    expect(txCompetitionUpdate).toHaveBeenCalledWith({ where: { id: "comp1" }, data: { publicResults: true } });
  });

  it("проверяет право result:publish", async () => {
    divisionFindMany.mockResolvedValue([]);
    await publishCompetitionResults("comp1");
    expect(requirePermissionMock).toHaveBeenCalledWith("result:publish", "comp1");
  });
});

describe("unpublishCompetitionResults() — требует причину, не стирает историю", () => {
  it("отклоняет без причины", async () => {
    await expect(unpublishCompetitionResults("comp1", "  ")).rejects.toBeInstanceOf(ValidationFailedError);
    expect(txCompetitionUpdate).not.toHaveBeenCalled();
  });

  it("выключает publicResults и пишет audit с причиной", async () => {
    await unpublishCompetitionResults("comp1", "Нашли ошибку в подсчёте");
    expect(txCompetitionUpdate).toHaveBeenCalledWith({ where: { id: "comp1" }, data: { publicResults: false } });
    expect(txAuditCreate.mock.calls[0][0].data.reason).toBe("Нашли ошибку в подсчёте");
  });
});

describe("correctResult() — correction workflow (CLAUDE.md §29-30)", () => {
  beforeEach(() => {
    resultFindUniqueOrThrow.mockResolvedValue({
      id: "res1",
      divisionId: "div1",
      registrationId: "reg-a",
      division: { competitionId: "comp1" },
      registration: { role: "LEADER" },
    });
  });

  it("отклоняет без причины", async () => {
    txResultFindFirstOrThrow.mockResolvedValue({ divisionId: "div1", registrationId: "reg-a", version: 1, roundReachedId: "r1", publishedAt: null });
    await expect(correctResult("res1", { status: "ELIMINATED", placement: null }, "")).rejects.toBeInstanceOf(ValidationFailedError);
    expect(txResultCreate).not.toHaveBeenCalled();
  });

  it("создаёт новую версию поверх текущей, не трогая старую строку", async () => {
    txResultFindFirstOrThrow.mockResolvedValue({
      divisionId: "div1",
      registrationId: "reg-a",
      version: 1,
      roundReachedId: "r1",
      status: "FINALIST",
      placement: 3,
      publishedAt: null,
    });

    await correctResult("res1", { status: "FINALIST", placement: 2 }, "Судья ошибся при подсчёте");

    expect(txResultCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        divisionId: "div1",
        registrationId: "reg-a",
        version: 2,
        status: "FINALIST",
        placement: 2,
        publishedAt: null,
        publishedById: null,
        reason: "Судья ошибся при подсчёте",
      }),
    });
    const audit = txAuditCreate.mock.calls[0][0].data;
    expect(audit.action).toBe("result.correct");
    expect(audit.before).toEqual({ status: "FINALIST", placement: 3, version: 1 });
    expect(audit.reason).toBe("Судья ошибся при подсчёте");
  });

  it("если предыдущая версия уже была опубликована — новая версия публикуется сразу же", async () => {
    txResultFindFirstOrThrow.mockResolvedValue({
      divisionId: "div1",
      registrationId: "reg-a",
      version: 2,
      roundReachedId: "r1",
      status: "FINALIST",
      placement: 2,
      publishedAt: new Date("2026-09-01"),
    });

    await correctResult("res1", { status: "FINALIST", placement: 1 }, "Опубликованное место было неверным");

    const data = txResultCreate.mock.calls[0][0].data;
    expect(data.publishedAt).toBeInstanceOf(Date);
    expect(data.publishedById).toBe("u1");
  });

  // РЕГРЕССИЯ (найдено вживую 2026-09-08): ручная правка одной строки без
  // проверки соседей позволила поставить двух разных участников на одно и
  // то же 2 место (3 место при этом осталось никем не занято). БД не
  // должна допускать такое состояние — исправление обязано быть отклонено,
  // а не создавать дубликат.
  it("отклоняет исправление, если место уже занято ДРУГИМ участником той же роли", async () => {
    txResultFindFirstOrThrow.mockResolvedValue({
      divisionId: "div1",
      registrationId: "reg-a",
      version: 1,
      roundReachedId: "r1",
      status: "FINALIST",
      placement: 3,
      publishedAt: null,
    });
    txResultFindMany.mockResolvedValue([
      { registrationId: "reg-a", version: 1, status: "FINALIST", placement: 3, registration: { dancer: { displayName: "Денисевич Николай" }, checkIn: { bibNumber: "2" } } },
      { registrationId: "reg-b", version: 1, status: "FINALIST", placement: 2, registration: { dancer: { displayName: "Зеленковский Сергей" }, checkIn: { bibNumber: "4" } } },
    ]);

    await expect(correctResult("res1", { status: "FINALIST", placement: 2 }, "хочу поставить на 2 место")).rejects.toThrow(/Зеленковский Сергей/);
    expect(txResultCreate).not.toHaveBeenCalled();
  });

  it("не мешает исправлению, если место совпадает с ТЕКУЩИМ (то же самое место того же участника)", async () => {
    txResultFindFirstOrThrow.mockResolvedValue({
      divisionId: "div1",
      registrationId: "reg-a",
      version: 1,
      roundReachedId: "r1",
      status: "FINALIST",
      placement: 2,
      publishedAt: null,
    });
    txResultFindMany.mockResolvedValue([
      { registrationId: "reg-a", version: 1, status: "FINALIST", placement: 2, registration: { dancer: { displayName: "Денисевич Николай" }, checkIn: { bibNumber: "2" } } },
    ]);

    await correctResult("res1", { status: "FINALIST", placement: 2 }, "уточнение причины, место не меняется");
    expect(txResultCreate).toHaveBeenCalled();
  });
});

describe("swapResultPlacements() — атомарный обмен местами двух финалистов", () => {
  beforeEach(() => {
    resultFindUniqueOrThrow.mockImplementation((args: { where: { id: string } }) => {
      const id = args.where.id;
      if (id === "resA") return Promise.resolve({ id: "resA", divisionId: "div1", registrationId: "reg-a", division: { competitionId: "comp1" }, registration: { role: "LEADER" } });
      if (id === "resB") return Promise.resolve({ id: "resB", divisionId: "div1", registrationId: "reg-b", division: { competitionId: "comp1" }, registration: { role: "LEADER" } });
      return Promise.reject(new Error(`unexpected id ${id}`));
    });
  });

  it("отклоняет без причины", async () => {
    await expect(swapResultPlacements("resA", "resB", "")).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it("отклоняет обмен участника с самим собой (тот же resultId)", async () => {
    await expect(swapResultPlacements("resA", "resA", "причина")).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it("отклоняет, если результаты из разных дивизионов или ролей", async () => {
    resultFindUniqueOrThrow.mockImplementation((args: { where: { id: string } }) => {
      const id = args.where.id;
      if (id === "resA") return Promise.resolve({ id: "resA", divisionId: "div1", registrationId: "reg-a", division: { competitionId: "comp1" }, registration: { role: "LEADER" } });
      if (id === "resB") return Promise.resolve({ id: "resB", divisionId: "div1", registrationId: "reg-b", division: { competitionId: "comp1" }, registration: { role: "FOLLOWER" } });
      return Promise.reject(new Error("unexpected"));
    });
    await expect(swapResultPlacements("resA", "resB", "причина")).rejects.toBeInstanceOf(ValidationFailedError);
    expect(txResultCreate).not.toHaveBeenCalled();
  });

  it("отклоняет, если один из участников не является действующим финалистом", async () => {
    txResultFindFirstOrThrow
      .mockResolvedValueOnce({ divisionId: "div1", registrationId: "reg-a", version: 1, roundReachedId: "r1", status: "FINALIST", placement: 2, publishedAt: null })
      .mockResolvedValueOnce({ divisionId: "div1", registrationId: "reg-b", version: 1, roundReachedId: "r1", status: "ELIMINATED", placement: null, publishedAt: null });
    await expect(swapResultPlacements("resA", "resB", "причина")).rejects.toBeInstanceOf(ValidationFailedError);
    expect(txResultCreate).not.toHaveBeenCalled();
  });

  it("меняет местами обе строки одной транзакцией — по новой версии каждому, с audit на обоих", async () => {
    txResultFindFirstOrThrow
      .mockResolvedValueOnce({ divisionId: "div1", registrationId: "reg-a", version: 1, roundReachedId: "r1", status: "FINALIST", placement: 2, publishedAt: null })
      .mockResolvedValueOnce({ divisionId: "div1", registrationId: "reg-b", version: 1, roundReachedId: "r1", status: "FINALIST", placement: 3, publishedAt: null });
    txResultCreate.mockResolvedValueOnce({ id: "res-newA", placement: 3, version: 2 }).mockResolvedValueOnce({ id: "res-newB", placement: 2, version: 2 });

    await swapResultPlacements("resA", "resB", "Перепутали местами при вводе");

    expect(txResultCreate).toHaveBeenNthCalledWith(1, { data: expect.objectContaining({ registrationId: "reg-a", placement: 3, version: 2 }) });
    expect(txResultCreate).toHaveBeenNthCalledWith(2, { data: expect.objectContaining({ registrationId: "reg-b", placement: 2, version: 2 }) });
    const auditRows = txAuditCreateMany.mock.calls[0][0].data;
    expect(auditRows).toHaveLength(2);
    expect(auditRows.every((r: { action: string; reason: string }) => r.action === "result.swap" && r.reason === "Перепутали местами при вводе")).toBe(true);
  });
});
