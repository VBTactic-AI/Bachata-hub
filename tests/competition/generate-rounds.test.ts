import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Actor } from "@/server/rbac/actor";

const requirePermissionMock = vi.fn();
vi.mock("@/server/rbac/authorize", () => ({ requirePermission: (...a: unknown[]) => requirePermissionMock(...a) }));

const divisionFindUniqueOrThrow = vi.fn();
const registrationCount = vi.fn();
const stageFindMany = vi.fn();
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
    registration: { count: (...a: unknown[]) => registrationCount(...a) },
    roundStageCatalog: { findMany: (...a: unknown[]) => stageFindMany(...a) },
    round: { count: (...a: unknown[]) => roundCount(...a) },
    $transaction: (fn: (tx: typeof fakeTx) => unknown) => fn(fakeTx),
  },
}));

const { generateRounds } = await import("@/server/competition/generate-rounds");
const { ValidationFailedError } = await import("@/server/errors");

const actor: Actor = { userId: "u1", email: "a@b.by", globalPermissions: new Set(), permissionsByCompetition: new Map() };

const STAGES = [
  { id: "st-prelim", name: "Отборочный", order: 1, isActive: true, defaultAdvanceCount: 20 },
  { id: "st-qf", name: "Четвертьфинал", order: 2, isActive: true, defaultAdvanceCount: 8 },
  { id: "st-sf", name: "Полуфинал", order: 3, isActive: true, defaultAdvanceCount: 4 },
  { id: "st-final", name: "Финал", order: 4, isActive: true, defaultAdvanceCount: 1 },
];

beforeEach(() => {
  requirePermissionMock.mockReset().mockResolvedValue(actor);
  divisionFindUniqueOrThrow.mockReset().mockResolvedValue({ id: "div1", competitionId: "comp1", heatCapacity: 10 });
  registrationCount.mockReset().mockResolvedValue(0);
  stageFindMany.mockReset().mockResolvedValue(STAGES);
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
    registrationCount.mockResolvedValue(5);
    await generateRounds("div1");
    expect(requirePermissionMock).toHaveBeenCalledWith("round:create", "comp1");
  });

  it("отклоняет генерацию, если в справочнике нет активных этапов", async () => {
    stageFindMany.mockResolvedValue([]);
    registrationCount.mockResolvedValue(5);
    await expect(generateRounds("div1")).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it("отклоняет генерацию, если нет ни одного участника с check-in", async () => {
    registrationCount.mockResolvedValue(0);
    await expect(generateRounds("div1")).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it("создаёт все 4 этапа, если участников больше, чем проходит из первого", async () => {
    registrationCount.mockResolvedValueOnce(45).mockResolvedValueOnce(40); // leaders=45, followers=40 -> pool=45

    const result = await generateRounds("div1");

    expect(result.createdRoundIds).toHaveLength(4);
    const stageIds = roundCreate.mock.calls.map((c) => c[0].data.stageId);
    expect(stageIds).toEqual(["st-prelim", "st-qf", "st-sf", "st-final"]);
  });

  it("пропускает этап, если в него и так проходит не меньше, чем осталось", async () => {
    registrationCount.mockResolvedValueOnce(15).mockResolvedValueOnce(10); // pool=15, Отборочный(20) избыточен

    const result = await generateRounds("div1");

    const stageIds = roundCreate.mock.calls.map((c) => c[0].data.stageId);
    expect(stageIds).toEqual(["st-qf", "st-sf", "st-final"]);
    expect(result.createdRoundIds).toHaveLength(3);
  });

  it("последний этап справочника создаётся всегда, даже если формально избыточен", async () => {
    registrationCount.mockResolvedValueOnce(1).mockResolvedValueOnce(1); // pool=1, все этапы избыточны кроме финала

    const result = await generateRounds("div1");

    const stageIds = roundCreate.mock.calls.map((c) => c[0].data.stageId);
    expect(stageIds).toEqual(["st-final"]);
    expect(result.createdRoundIds).toHaveLength(1);
  });

  it("считает число заездов = ceil(участников на старте раунда / вместимость)", async () => {
    registrationCount.mockResolvedValueOnce(45).mockResolvedValueOnce(40); // pool=45, heatCapacity=10

    await generateRounds("div1");

    // Отборочный: 45 участников -> 5 заездов. Четвертьфинал: 20 -> 2. Полуфинал: 8 -> 1. Финал: 4 -> 1.
    expect(heatCreate).toHaveBeenCalledTimes(5 + 2 + 1 + 1);
  });

  it("новые раунды продолжают order с уже существующих", async () => {
    registrationCount.mockResolvedValueOnce(1).mockResolvedValueOnce(1); // только финал
    roundCount.mockResolvedValue(3);

    await generateRounds("div1");

    expect(roundCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ order: 4 }) }));
  });

  it("переиспользует вместимость заезда дивизиона, если у раунда нет своей", async () => {
    registrationCount.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    divisionFindUniqueOrThrow.mockResolvedValue({ id: "div1", competitionId: "comp1", heatCapacity: 3 });

    await generateRounds("div1");

    // Финал: pool=1, вместимость 3 -> ceil(1/3)=1 заезд.
    expect(heatCreate).toHaveBeenCalledTimes(1);
  });
});
