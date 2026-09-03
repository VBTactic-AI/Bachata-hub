import { describe, it, expect, vi, beforeEach } from "vitest";

// Самый частый источник ошибок в этом слое — забыть привязать право к
// конкретному competitionId (тогда EVENT_ADMIN одного соревнования получил
// бы доступ к чужому). Эти тесты проверяют именно аргументы вызова
// requirePermission(), а не саму RBAC-логику (она уже покрыта
// tests/rbac/*).
const requirePermissionMock = vi.fn();
vi.mock("@/server/rbac/authorize", () => ({ requirePermission: (...a: unknown[]) => requirePermissionMock(...a) }));

const auditCreate = vi.fn();
const divisionCreate = vi.fn();
const rulesFindFirst = vi.fn();
const rulesCreate = vi.fn();
const fakeTx = {
  division: { create: divisionCreate },
  competitionRules: { findFirst: rulesFindFirst, create: rulesCreate },
  auditLog: { create: auditCreate },
};
vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: (fn: (tx: typeof fakeTx) => unknown) => fn(fakeTx) },
}));

const { addDivision } = await import("@/server/competition/add-division");
const { setCompetitionRules } = await import("@/server/competition/set-rules");

const actor = { userId: "u1", email: "a@b.by" };

beforeEach(() => {
  requirePermissionMock.mockReset().mockResolvedValue(actor);
  auditCreate.mockReset();
  divisionCreate.mockReset().mockResolvedValue({ id: "div1", name: "Novice", level: "NOVICE" });
  rulesFindFirst.mockReset().mockResolvedValue(null);
  rulesCreate.mockReset().mockResolvedValue({ id: "rules1", version: 1 });
});

describe("привязка прав к конкретному соревнованию", () => {
  it("addDivision проверяет competition:update ИМЕННО для этого competitionId", async () => {
    await addDivision("comp1", { name: "Novice", level: "NOVICE", rules: {} } as never);
    expect(requirePermissionMock).toHaveBeenCalledWith("competition:update", "comp1");
  });

  it("setCompetitionRules проверяет competition:settings_update ИМЕННО для этого competitionId", async () => {
    await setCompetitionRules("comp2", { foo: "bar" });
    expect(requirePermissionMock).toHaveBeenCalledWith("competition:settings_update", "comp2");
  });

  it("setCompetitionRules увеличивает версию правил, а не перезаписывает (docs/00_DECISIONS.md, A1)", async () => {
    rulesFindFirst.mockResolvedValue({ version: 3 });
    rulesCreate.mockResolvedValue({ id: "rules4", version: 4 });

    const result = await setCompetitionRules("comp2", {});

    expect(rulesCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ version: 4 }) }));
    expect(result.version).toBe(4);
  });
});
