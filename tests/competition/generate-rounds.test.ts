import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Actor } from "@/server/rbac/actor";

const requirePermissionMock = vi.fn();
vi.mock("@/server/rbac/authorize", () => ({ requirePermission: (...a: unknown[]) => requirePermissionMock(...a) }));

const divisionFindUniqueOrThrow = vi.fn();
const stagePlanFindMany = vi.fn();
const roundCount = vi.fn();
const rulesFindFirst = vi.fn();
const rulesCreate = vi.fn();
const roundCreate = vi.fn();
const heatCreate = vi.fn();
const auditCreate = vi.fn();

let roundCreateSeq = 0;
let heatCreateSeq = 0;

const fakeTx = {
  competitionRules: { findFirst: rulesFindFirst, create: rulesCreate },
  round: { create: (...a: unknown[]) => roundCreate(...a) },
  heat: { create: (...a: unknown[]) => heatCreate(...a) },
  auditLog: { create: auditCreate },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    division: { findUniqueOrThrow: (...a: unknown[]) => divisionFindUniqueOrThrow(...a) },
    divisionStagePlan: { findMany: (...a: unknown[]) => stagePlanFindMany(...a) },
    round: { count: (...a: unknown[]) => roundCount(...a) },
    $transaction: (fn: (tx: typeof fakeTx) => unknown) => fn(fakeTx),
  },
}));

const { generateRounds } = await import("@/server/competition/generate-rounds");
const { ValidationFailedError } = await import("@/server/errors");

const actor: Actor = { userId: "u1", email: "a@b.by", globalPermissions: new Set(), permissionsByCompetition: new Map() };

// План этого КОНКРЕТНОГО дивизиона (docs/00_DECISIONS.md, A14) — задан один
// раз при создании дивизиона, здесь просто читается, не пересчитывается.
const FULL_PLAN = [
  { stageId: "st-qf", participantCount: 8, stage: { name: "Четвертьфинал", order: 2 } },
  { stageId: "st-sf", participantCount: 4, stage: { name: "Полуфинал", order: 3 } },
  { stageId: "st-final", participantCount: 2, stage: { name: "Финал", order: 4 } },
];

beforeEach(() => {
  requirePermissionMock.mockReset().mockResolvedValue(actor);
  divisionFindUniqueOrThrow.mockReset().mockResolvedValue({ id: "div1", competitionId: "comp1", heatCapacity: 10 });
  stagePlanFindMany.mockReset().mockResolvedValue(FULL_PLAN);
  roundCount.mockReset().mockResolvedValue(0);
  rulesFindFirst.mockReset().mockResolvedValue({ id: "rules-existing", version: 1 });
  rulesCreate.mockReset();
  roundCreateSeq = 0;
  roundCreate.mockReset().mockImplementation(() => Promise.resolve({ id: `round${++roundCreateSeq}` }));
  heatCreateSeq = 0;
  heatCreate.mockReset().mockImplementation(() => Promise.resolve({ id: `heat${++heatCreateSeq}` }));
  auditCreate.mockReset();
});

describe("generateRounds()", () => {
  it("проверяет round:create ИМЕННО для competitionId дивизиона", async () => {
    await generateRounds("div1");
    expect(requirePermissionMock).toHaveBeenCalledWith("round:create", "comp1");
  });

  it("отклоняет генерацию, если для дивизиона не задан план по этапам", async () => {
    stagePlanFindMany.mockResolvedValue([]);
    await expect(generateRounds("div1")).rejects.toBeInstanceOf(ValidationFailedError);
    expect(roundCreate).not.toHaveBeenCalled();
  });

  it("создаёт раунд на каждый этап плана, в порядке этапа", async () => {
    const result = await generateRounds("div1");

    expect(result.createdRoundIds).toHaveLength(3);
    const stageIds = roundCreate.mock.calls.map((c) => c[0].data.stageId);
    expect(stageIds).toEqual(["st-qf", "st-sf", "st-final"]);
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

  it("новые раунды продолжают order с уже существующих", async () => {
    roundCount.mockResolvedValue(3);

    await generateRounds("div1");

    expect(roundCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ order: 4 }) }));
  });

  it("переиспользует вместимость заезда дивизиона для расчёта числа заездов", async () => {
    divisionFindUniqueOrThrow.mockResolvedValue({ id: "div1", competitionId: "comp1", heatCapacity: 3 });

    await generateRounds("div1");

    // Четвертьфинал: ceil(8/3)=3, Полуфинал: ceil(4/3)=2, Финал: ceil(2/3)=1.
    expect(heatCreate).toHaveBeenCalledTimes(3 + 2 + 1);
  });
});
