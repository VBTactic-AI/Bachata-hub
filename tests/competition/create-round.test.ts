import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Actor } from "@/server/rbac/actor";

const requirePermissionMock = vi.fn();
vi.mock("@/server/rbac/authorize", () => ({ requirePermission: (...a: unknown[]) => requirePermissionMock(...a) }));

const divisionFindUniqueOrThrow = vi.fn();
const stageFindUnique = vi.fn();
const rulesFindFirst = vi.fn();
const rulesCreate = vi.fn();
const roundFindFirst = vi.fn();
const roundCreate = vi.fn();
const auditCreate = vi.fn();

const fakeTx = {
  competitionRules: { findFirst: rulesFindFirst, create: rulesCreate },
  round: { findFirst: roundFindFirst, create: roundCreate },
  auditLog: { create: auditCreate },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    division: { findUniqueOrThrow: (...a: unknown[]) => divisionFindUniqueOrThrow(...a) },
    roundStageCatalog: { findUnique: (...a: unknown[]) => stageFindUnique(...a) },
    $transaction: (fn: (tx: typeof fakeTx) => unknown) => fn(fakeTx),
  },
}));

const { createRound } = await import("@/server/competition/create-round");
const { ValidationFailedError } = await import("@/server/errors");

const actor: Actor = { userId: "u1", email: "a@b.by", globalPermissions: new Set(), permissionsByCompetition: new Map() };

beforeEach(() => {
  requirePermissionMock.mockReset().mockResolvedValue(actor);
  divisionFindUniqueOrThrow.mockReset().mockResolvedValue({ competitionId: "comp1" });
  stageFindUnique.mockReset().mockResolvedValue({ id: "stage1", name: "Отборочный", isActive: true, defaultAdvanceCount: 20 });
  rulesFindFirst.mockReset().mockResolvedValue(null);
  rulesCreate.mockReset().mockResolvedValue({ id: "rules1", version: 1 });
  roundFindFirst.mockReset().mockResolvedValue(null);
  roundCreate.mockReset().mockResolvedValue({ id: "round1", stageId: "stage1" });
  auditCreate.mockReset();
});

describe("createRound()", () => {
  it("проверяет round:create ИМЕННО для competitionId дивизиона", async () => {
    await createRound("div1", { stageId: "stage1", finalistsCount: 20 });

    expect(requirePermissionMock).toHaveBeenCalledWith("round:create", "comp1");
  });

  it("отклоняет несуществующий или скрытый этап понятной ошибкой", async () => {
    stageFindUnique.mockResolvedValue(null);
    await expect(createRound("div1", { stageId: "missing", finalistsCount: 10 })).rejects.toBeInstanceOf(
      ValidationFailedError
    );
    expect(roundCreate).not.toHaveBeenCalled();

    stageFindUnique.mockResolvedValue({ id: "stage1", name: "Скрытый", isActive: false, defaultAdvanceCount: 10 });
    await expect(createRound("div1", { stageId: "stage1", finalistsCount: 10 })).rejects.toBeInstanceOf(
      ValidationFailedError
    );
  });

  it("автосоздаёт версию правил {} при первом раунде соревнования", async () => {
    rulesFindFirst.mockResolvedValue(null);

    await createRound("div1", { stageId: "stage1", finalistsCount: 20 });

    expect(rulesCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ competitionId: "comp1", version: 1, rules: {} }) })
    );
    expect(roundCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ rulesId: "rules1", stageId: "stage1", finalistsCount: 20 }) })
    );
    // Аудит и для автосоздания правил, и для самого раунда.
    expect(auditCreate).toHaveBeenCalledTimes(2);
    expect(auditCreate.mock.calls[0][0].data.action).toBe("competition_rules.create");
    expect(auditCreate.mock.calls[1][0].data.action).toBe("round.create");
  });

  it("переиспользует последнюю версию правил, если она уже есть", async () => {
    rulesFindFirst.mockResolvedValue({ id: "rules-existing", version: 3 });

    await createRound("div1", { stageId: "stage1", finalistsCount: 8 });

    expect(rulesCreate).not.toHaveBeenCalled();
    expect(roundCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ rulesId: "rules-existing" }) })
    );
    expect(auditCreate).toHaveBeenCalledOnce();
  });

  it("order = максимальный существующий + 1 в рамках дивизиона", async () => {
    roundFindFirst.mockResolvedValue({ order: 2 });
    rulesFindFirst.mockResolvedValue({ id: "rules-existing", version: 1 });

    await createRound("div1", { stageId: "stage1", finalistsCount: 8 });

    expect(roundCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ order: 3 }) }));
  });

  it("первый раунд дивизиона получает order 1", async () => {
    roundFindFirst.mockResolvedValue(null);
    rulesFindFirst.mockResolvedValue({ id: "rules-existing", version: 1 });

    await createRound("div1", { stageId: "stage1", finalistsCount: 20 });

    expect(roundCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ order: 1 }) }));
  });
});
