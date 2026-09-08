import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Actor } from "@/server/rbac/actor";

const requirePermissionMock = vi.fn();
vi.mock("@/server/rbac/authorize", () => ({ requirePermission: (...a: unknown[]) => requirePermissionMock(...a) }));

const divisionFindUniqueOrThrow = vi.fn();
const registrationCount = vi.fn();
const rulesFindFirst = vi.fn();
const rulesCreate = vi.fn();
const roundCreate = vi.fn();
const roundDeleteMany = vi.fn();
const heatCreate = vi.fn();
const auditCreate = vi.fn();
const auditCreateMany = vi.fn();

let roundCreateSeq = 0;
let heatCreateSeq = 0;

const fakeTx = {
  competitionRules: { findFirst: rulesFindFirst, create: rulesCreate },
  round: { create: (...a: unknown[]) => roundCreate(...a), deleteMany: (...a: unknown[]) => roundDeleteMany(...a) },
  heat: { create: (...a: unknown[]) => heatCreate(...a) },
  auditLog: { create: auditCreate, createMany: auditCreateMany },
};

// division.findUniqueOrThrow теперь возвращает план и существующие раунды
// вложенными (relationLoadStrategy: "join", один round-trip вместо трёх) —
// divisionStagePlan.findMany/round.findMany отдельными вызовами прismы
// больше не существуют, план/раунды приходят полями stagePlan/rounds.
vi.mock("@/lib/prisma", () => ({
  prisma: {
    division: { findUniqueOrThrow: (...a: unknown[]) => divisionFindUniqueOrThrow(...a), findFirstOrThrow: (...a: unknown[]) => divisionFindUniqueOrThrow(...a) },
    registration: { count: (...a: unknown[]) => registrationCount(...a) },
    $transaction: (fn: (tx: typeof fakeTx) => unknown) => fn(fakeTx),
  },
}));

const { generateRounds, selectStepsToGenerate } = await import("@/server/competition/generate-rounds");
const { ValidationFailedError } = await import("@/server/errors");

const actor: Actor = { userId: "u1", email: "a@b.by", globalPermissions: new Set(), permissionsByCompetition: new Map() };

// План этого КОНКРЕТНОГО дивизиона (docs/00_DECISIONS.md, A14) — задан один
// раз при создании дивизиона, здесь просто читается, не пересчитывается.
const FULL_PLAN = [
  { stageId: "st-qf", participantCount: 8, stage: { name: "Четвертьфинал", order: 2 } },
  { stageId: "st-sf", participantCount: 4, stage: { name: "Полуфинал", order: 3 } },
  { stageId: "st-final", participantCount: 2, stage: { name: "Финал", order: 4 } },
];

function mockDivision(overrides?: {
  heatCapacity?: number;
  judgingMaxScore?: number;
  stagePlan?: unknown[];
  rounds?: unknown[];
}) {
  divisionFindUniqueOrThrow.mockResolvedValue({
    id: "div1",
    competitionId: "comp1",
    heatCapacity: overrides?.heatCapacity ?? 10,
    judgingMaxScore: overrides?.judgingMaxScore ?? 1,
    stagePlan: overrides?.stagePlan ?? FULL_PLAN,
    rounds: overrides?.rounds ?? [],
  });
}

beforeEach(() => {
  requirePermissionMock.mockReset().mockResolvedValue(actor);
  divisionFindUniqueOrThrow.mockReset();
  mockDivision();
  // По умолчанию — как будто реально зарегистрировано столько же, сколько
  // участвует в первом этапе плана (8/8) — ни один этап не пропускается,
  // существующие тесты этого файла продолжают проверять "план без пропусков".
  registrationCount.mockReset().mockResolvedValue(8);
  rulesFindFirst.mockReset().mockResolvedValue({ id: "rules-existing", version: 1 });
  rulesCreate.mockReset();
  roundCreateSeq = 0;
  roundCreate.mockReset().mockImplementation(() => Promise.resolve({ id: `round${++roundCreateSeq}` }));
  roundDeleteMany.mockReset().mockResolvedValue({ count: 0 });
  heatCreateSeq = 0;
  heatCreate.mockReset().mockImplementation(() => Promise.resolve({ id: `heat${++heatCreateSeq}` }));
  auditCreate.mockReset();
  auditCreateMany.mockReset();
});

describe("generateRounds()", () => {
  it("проверяет round:create ИМЕННО для competitionId дивизиона", async () => {
    await generateRounds("div1");
    expect(requirePermissionMock).toHaveBeenCalledWith("round:create", "comp1");
  });

  it("отклоняет генерацию, если для дивизиона не задан план по этапам", async () => {
    mockDivision({ stagePlan: [] });
    await expect(generateRounds("div1")).rejects.toBeInstanceOf(ValidationFailedError);
    expect(roundCreate).not.toHaveBeenCalled();
  });

  it("создаёт раунд на каждый этап плана, в порядке этапа", async () => {
    const result = await generateRounds("div1");

    expect(result.createdRoundIds).toHaveLength(3);
    const stageIds = roundCreate.mock.calls.map((c) => c[0].data.stageId);
    expect(stageIds).toEqual(["st-qf", "st-sf", "st-final"]);
  });

  // Perf fix (docs/PROGRESS.md, Performance Diagnostic Mode): audit-записи
  // на каждый созданный Round/Heat раньше писались по одной (createCall),
  // теперь одним createMany — но каждая запись должна остаться отдельной
  // строкой с собственным action/entityId/after, не одной "суммарной".
  it("пишет audit одним createMany на все Round/Heat разом, с корректным содержимым по каждому", async () => {
    await generateRounds("div1");

    expect(auditCreate).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "round.create" }) }));
    expect(auditCreateMany).toHaveBeenCalledTimes(1);
    const rows = auditCreateMany.mock.calls[0][0].data as Array<{ action: string; entityId: string }>;
    // 3 этапа плана -> 3 round.create + 3 heat.create (по 1 заходу на этап при heatCapacity=10).
    expect(rows.filter((r) => r.action === "round.create")).toHaveLength(3);
    expect(rows.filter((r) => r.action === "heat.create")).toHaveLength(3);
  });

  it("finalistsCount раунда = participantCount СЛЕДУЮЩЕГО этапа плана", async () => {
    await generateRounds("div1");

    const byStage = new Map(roundCreate.mock.calls.map((c) => [c[0].data.stageId, c[0].data.finalistsCount]));
    expect(byStage.get("st-qf")).toBe(4); // из четвертьфинала (8) проходит 4 — сколько участвует в полуфинале
    expect(byStage.get("st-sf")).toBe(2); // из полуфинала (4) проходит 2 — сколько участвует в финале
  });

  it("у последнего этапа плана finalistsCount = его собственный participantCount (следующего нет)", async () => {
    await generateRounds("div1");

    const finalCall = roundCreate.mock.calls.find((c) => c[0].data.stageId === "st-final");
    expect(finalCall?.[0].data.finalistsCount).toBe(2);
  });

  it("считает число заездов = ceil(participantCount этого этапа / вместимость)", async () => {
    await generateRounds("div1");

    // Четвертьфинал: 8/10 -> 1. Полуфинал: 4/10 -> 1. Финал: 2/10 -> 1.
    expect(heatCreate).toHaveBeenCalledTimes(3);
  });

  it("переиспользует judgingMaxScore дивизиона для каждого созданного раунда", async () => {
    mockDivision({ judgingMaxScore: 2 });

    await generateRounds("div1");

    for (const call of roundCreate.mock.calls) {
      expect(call[0].data.judgingMaxScore).toBe(2);
    }
  });

  it("переиспользует вместимость заезда дивизиона для расчёта числа заездов", async () => {
    mockDivision({ heatCapacity: 3 });

    await generateRounds("div1");

    // Четвертьфинал: ceil(8/3)=3, Полуфинал: ceil(4/3)=2, Финал: ceil(2/3)=1.
    expect(heatCreate).toHaveBeenCalledTimes(3 + 2 + 1);
  });
});

// Пересборка (docs/00_DECISIONS.md, A14, 2026-09-04): если у дивизиона уже
// есть раунды, кнопка их заменяет, а не добавляет новые поверх.
describe("generateRounds() — пересборка существующих раундов", () => {
  it("если раундов ещё не было — order начинается с 1, deleteMany не вызывается", async () => {
    await generateRounds("div1");

    expect(roundDeleteMany).not.toHaveBeenCalled();
    expect(roundCreate).toHaveBeenNthCalledWith(1, expect.objectContaining({ data: expect.objectContaining({ order: 1 }) }));
  });

  it("если все существующие раунды ещё DRAFT/READY — удаляет их и строит заново с order=1", async () => {
    mockDivision({
      rounds: [
        { id: "old1", status: "DRAFT", stage: { name: "Четвертьфинал" } },
        { id: "old2", status: "READY", stage: { name: "Полуфинал" } },
      ],
    });

    await generateRounds("div1");

    expect(roundDeleteMany).toHaveBeenCalledWith({ where: { divisionId: "div1" } });
    expect(roundCreate).toHaveBeenNthCalledWith(1, expect.objectContaining({ data: expect.objectContaining({ order: 1 }) }));
    const auditActions = auditCreate.mock.calls.map((c) => c[0].data.action);
    expect(auditActions).toContain("division.regenerate_rounds");
  });

  it("отклоняет пересборку, если хотя бы один раунд уже начат (не DRAFT/READY)", async () => {
    mockDivision({ rounds: [{ id: "old1", status: "RUNNING", stage: { name: "Четвертьфинал" } }] });

    await expect(generateRounds("div1")).rejects.toBeInstanceOf(ValidationFailedError);
    expect(roundDeleteMany).not.toHaveBeenCalled();
    expect(roundCreate).not.toHaveBeenCalled();
  });
});

// Автопропуск этапов, которые никого не отсеивают (2026-09-06, разворот
// части A14 по прямому запросу пользователя — план по-прежнему единственный
// источник чисел, но сравнивается с реальными зарегистрированными перед
// генерацией). Сценарий — реальный кейс, найденный пользователем: категория
// "Дебютанты" (7 ведущих / 13 ведомых) с планом
// Отборочный(25)->Четвертьфинал(20)->Полуфинал(10)->Финал(6).
describe("generateRounds() — автопропуск этапов без отсева", () => {
  const PLAN_WITH_QUALIFYING = [
    { stageId: "st-qual", participantCount: 25, stage: { name: "Отборочный", order: 1 } },
    { stageId: "st-qf", participantCount: 20, stage: { name: "Четвертьфинал", order: 2 } },
    { stageId: "st-sf", participantCount: 10, stage: { name: "Полуфинал", order: 3 } },
    { stageId: "st-final", participantCount: 6, stage: { name: "Финал", order: 4 } },
  ];

  function mockLiveCounts(leaders: number, followers: number) {
    registrationCount.mockImplementation((args: { where: { role: "LEADER" | "FOLLOWER" } }) =>
      Promise.resolve(args.where.role === "LEADER" ? leaders : followers)
    );
  }

  it("7 ведущих / 13 ведомых — «Отборочный» пропущен (никого не отсеивает), первым идёт «Четвертьфинал»", async () => {
    mockDivision({ stagePlan: PLAN_WITH_QUALIFYING });
    mockLiveCounts(7, 13);

    const result = await generateRounds("div1");

    expect(result.createdRoundIds).toHaveLength(3);
    const stageIds = roundCreate.mock.calls.map((c) => c[0].data.stageId);
    expect(stageIds).toEqual(["st-qf", "st-sf", "st-final"]);
    // Четвертьфинал становится первым — order=1, а не 2.
    expect(roundCreate.mock.calls[0][0].data.order).toBe(1);
  });

  it("реально большое поле (30/30) — «Отборочный» реально отсеивает, создаётся", async () => {
    mockDivision({ stagePlan: PLAN_WITH_QUALIFYING });
    mockLiveCounts(30, 30);

    const result = await generateRounds("div1");

    expect(result.createdRoundIds).toHaveLength(4);
    const stageIds = roundCreate.mock.calls.map((c) => c[0].data.stageId);
    expect(stageIds).toEqual(["st-qual", "st-qf", "st-sf", "st-final"]);
  });

  it("отсев нужен только по одной роли (7М/13Ж — Ж больше порога) — этап не пропускается", async () => {
    // Порог Четвертьфинала = 10 (из Полуфинала). У Ж 13 > 10 — этап нужен,
    // даже если у М (7) уже давно всё "автоматом" (это дальше решает
    // rolesNotNeedingJudging в advancement.ts, не генерация раундов).
    mockDivision({ stagePlan: PLAN_WITH_QUALIFYING });
    mockLiveCounts(7, 13);

    await generateRounds("div1");

    const stageIds = roundCreate.mock.calls.map((c) => c[0].data.stageId);
    expect(stageIds).toContain("st-qf");
  });

  it("финал не пропускается никогда, даже если по плану он тоже 'без отсева'", async () => {
    // Уже 6/6 в реальности к первому этапу (гипотетический маленький
    // дивизион) — все промежуточные этапы пропущены, но Финал создаётся всё
    // равно, т.к. в нём определяются места, а не отсев.
    mockDivision({ stagePlan: PLAN_WITH_QUALIFYING });
    mockLiveCounts(6, 6);

    const result = await generateRounds("div1");

    expect(result.createdRoundIds).toHaveLength(1);
    expect(roundCreate.mock.calls[0][0].data.stageId).toBe("st-final");
  });

  it("записывает пропущенные этапы в audit division.generate_rounds", async () => {
    mockDivision({ stagePlan: PLAN_WITH_QUALIFYING });
    mockLiveCounts(7, 13);

    await generateRounds("div1");

    const divisionAudit = auditCreate.mock.calls.find((c) => c[0].data.action === "division.generate_rounds");
    expect(divisionAudit?.[0].data.after.skippedStages).toEqual(["Отборочный"]);
  });
});

describe("selectStepsToGenerate() — чистая функция", () => {
  const steps = [
    { stageId: "qual", stageName: "Отборочный", participantCount: 25, finalistsCount: 20 },
    { stageId: "qf", stageName: "Четвертьфинал", participantCount: 20, finalistsCount: 10 },
    { stageId: "sf", stageName: "Полуфинал", participantCount: 10, finalistsCount: 6 },
    { stageId: "final", stageName: "Финал", participantCount: 6, finalistsCount: 6 },
  ];

  it("пропускает этапы, у которых обе роли уже <= порога", () => {
    const result = selectStepsToGenerate(steps, { leaders: 7, followers: 13 });
    expect(result.map((s) => s.stageId)).toEqual(["qf", "sf", "final"]);
  });

  it("не пропускает ничего, если реальные числа больше первого порога", () => {
    const result = selectStepsToGenerate(steps, { leaders: 30, followers: 30 });
    expect(result.map((s) => s.stageId)).toEqual(["qual", "qf", "sf", "final"]);
  });

  it("никогда не пропускает последний этап плана", () => {
    const result = selectStepsToGenerate(steps, { leaders: 6, followers: 6 });
    expect(result.map((s) => s.stageId)).toEqual(["final"]);
  });

  it("после пропуска этапа пул для следующего решения не меняется (реальные числа несут дальше)", () => {
    // 9 ведущих: <=20 (Четвертьфинал порог с учётом Отборочного пропуска),
    // но >6 (Полуфинал порог) — Отборочный и Четвертьфинал пропущены (оба
    // порога >= 9), Полуфинал остаётся, т.к. 9 > 6.
    const result = selectStepsToGenerate(steps, { leaders: 9, followers: 9 });
    expect(result.map((s) => s.stageId)).toEqual(["sf", "final"]);
  });

  it("план из одного этапа — этот этап всегда создаётся (он же последний)", () => {
    const oneStep = [{ stageId: "final", stageName: "Финал", participantCount: 6, finalistsCount: 6 }];
    const result = selectStepsToGenerate(oneStep, { leaders: 3, followers: 3 });
    expect(result.map((s) => s.stageId)).toEqual(["final"]);
  });
});
