import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Actor } from "@/server/rbac/actor";

const requirePermissionMock = vi.fn();
vi.mock("@/server/rbac/authorize", () => ({ requirePermission: (...a: unknown[]) => requirePermissionMock(...a) }));

const findFirst = vi.fn();
const findUniqueOrThrow = vi.fn();
const criterionCreate = vi.fn();
const criterionUpdate = vi.fn();
const criterionDelete = vi.fn();
const auditCreate = vi.fn();

const fakeTx = {
  judgingCriterionCatalog: { create: criterionCreate, findUniqueOrThrow, update: criterionUpdate, delete: criterionDelete },
  auditLog: { create: auditCreate },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    judgingCriterionCatalog: { findFirst: (...a: unknown[]) => findFirst(...a), findUniqueOrThrow: (...a: unknown[]) => findUniqueOrThrow(...a) },
    $transaction: (fn: (tx: typeof fakeTx) => unknown) => fn(fakeTx),
  },
}));

const { createJudgingCriterionCatalog, updateJudgingCriterionCatalog, deleteJudgingCriterionCatalog } = await import(
  "@/server/competition/judging-criteria-catalog"
);
const { Prisma } = await import("@prisma/client");

const actor: Actor = { userId: "u1", email: "a@b.by", globalPermissions: new Set(), permissionsByCompetition: new Map() };

beforeEach(() => {
  requirePermissionMock.mockReset().mockResolvedValue(actor);
  findFirst.mockReset().mockResolvedValue(null);
  findUniqueOrThrow.mockReset();
  criterionCreate.mockReset();
  criterionUpdate.mockReset();
  criterionDelete.mockReset();
  auditCreate.mockReset();
});

describe("createJudgingCriterionCatalog()", () => {
  it("требует глобальное право judging_criteria:manage (справочник общий, без competitionId)", async () => {
    criterionCreate.mockResolvedValue({ id: "c1", name: "Музыкальность", minScore: 1, maxScore: 10, step: 1, order: 1 });
    await createJudgingCriterionCatalog({ name: "Музыкальность", minScore: 1, maxScore: 10, step: 1 });
    expect(requirePermissionMock).toHaveBeenCalledWith("judging_criteria:manage");
  });

  it("новый критерий получает следующий порядковый номер", async () => {
    findFirst.mockResolvedValue({ order: 5 });
    criterionCreate.mockResolvedValue({ id: "c2", name: "Техника", minScore: 1, maxScore: 10, step: 1, order: 6 });

    await createJudgingCriterionCatalog({ name: "Техника", minScore: 1, maxScore: 10, step: 1 });

    expect(criterionCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ order: 6 }) }));
  });

  it("отклоняет дубликат названия понятной ошибкой", async () => {
    const { ValidationFailedError } = await import("@/server/errors");
    criterionCreate.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "5.18.0" }));

    await expect(createJudgingCriterionCatalog({ name: "Техника", minScore: 1, maxScore: 10, step: 1 })).rejects.toBeInstanceOf(
      ValidationFailedError
    );
  });
});

describe("updateJudgingCriterionCatalog()", () => {
  it("не удаляет строку — только переключает isActive, с аудитом до/после", async () => {
    findUniqueOrThrow.mockResolvedValue({ id: "c1", name: "Музыкальность", minScore: 1, maxScore: 10, step: 1, order: 1, isActive: true });
    criterionUpdate.mockResolvedValue({ id: "c1", name: "Музыкальность", minScore: 1, maxScore: 10, step: 1, order: 1, isActive: false });

    await updateJudgingCriterionCatalog("c1", { isActive: false });

    expect(criterionUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "c1" }, data: expect.objectContaining({ isActive: false }) }));
    const entry = auditCreate.mock.calls[0][0].data;
    expect(entry.action).toBe("judging_criterion_catalog.update");
    expect(entry.before.isActive).toBe(true);
    expect(entry.after.isActive).toBe(false);
  });

  it("отклоняет дубликат названия понятной ошибкой", async () => {
    const { ValidationFailedError } = await import("@/server/errors");
    findUniqueOrThrow.mockResolvedValue({ id: "c1", name: "Музыкальность", minScore: 1, maxScore: 10, step: 1, order: 1, isActive: true });
    criterionUpdate.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "5.18.0" }));

    await expect(updateJudgingCriterionCatalog("c1", { name: "Техника" })).rejects.toBeInstanceOf(ValidationFailedError);
  });
});

describe("deleteJudgingCriterionCatalog() — 2026-09-09", () => {
  it("удаляет неиспользуемый показатель, с аудитом", async () => {
    findUniqueOrThrow.mockResolvedValue({
      id: "c1",
      name: "Музыкальность",
      minScore: 1,
      maxScore: 10,
      step: 1,
      order: 1,
      isActive: true,
      _count: { criteria: 0 },
    });

    await deleteJudgingCriterionCatalog("c1");

    expect(criterionDelete).toHaveBeenCalledWith({ where: { id: "c1" } });
    expect(auditCreate.mock.calls[0][0].data.action).toBe("judging_criterion_catalog.delete");
  });

  it("отклоняет удаление показателя, уже выбранного в критериях финала", async () => {
    const { ValidationFailedError } = await import("@/server/errors");
    findUniqueOrThrow.mockResolvedValue({
      id: "c1",
      name: "Музыкальность",
      minScore: 1,
      maxScore: 10,
      step: 1,
      order: 1,
      isActive: true,
      _count: { criteria: 3 },
    });

    await expect(deleteJudgingCriterionCatalog("c1")).rejects.toBeInstanceOf(ValidationFailedError);
    expect(criterionDelete).not.toHaveBeenCalled();
  });
});
