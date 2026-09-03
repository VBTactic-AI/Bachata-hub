import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Actor } from "@/server/rbac/actor";

const requirePermissionMock = vi.fn();
vi.mock("@/server/rbac/authorize", () => ({ requirePermission: (...a: unknown[]) => requirePermissionMock(...a) }));

const findFirst = vi.fn();
const findUniqueOrThrow = vi.fn();
const categoryCreate = vi.fn();
const categoryUpdate = vi.fn();
const auditCreate = vi.fn();

const fakeTx = {
  divisionCategory: { create: categoryCreate, findUniqueOrThrow, update: categoryUpdate },
  auditLog: { create: auditCreate },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    divisionCategory: { findFirst: (...a: unknown[]) => findFirst(...a) },
    $transaction: (fn: (tx: typeof fakeTx) => unknown) => fn(fakeTx),
  },
}));

const { createDivisionCategory, setDivisionCategoryActive } = await import("@/server/competition/division-category");
const { Prisma } = await import("@prisma/client");

const actor: Actor = { userId: "u1", email: "a@b.by", globalPermissions: new Set(), permissionsByCompetition: new Map() };

beforeEach(() => {
  requirePermissionMock.mockReset().mockResolvedValue(actor);
  findFirst.mockReset().mockResolvedValue(null);
  findUniqueOrThrow.mockReset();
  categoryCreate.mockReset();
  categoryUpdate.mockReset();
  auditCreate.mockReset();
});

describe("createDivisionCategory()", () => {
  it("требует глобальное право division_category:manage (без competitionId — справочник общий)", async () => {
    categoryCreate.mockResolvedValue({ id: "cat1", name: "Юниоры", order: 1 });
    await createDivisionCategory({ name: "Юниоры" });
    expect(requirePermissionMock).toHaveBeenCalledWith("division_category:manage");
  });

  it("новая категория получает следующий порядковый номер", async () => {
    findFirst.mockResolvedValue({ order: 5 });
    categoryCreate.mockResolvedValue({ id: "cat2", name: "Юниоры", order: 6 });

    await createDivisionCategory({ name: "Юниоры" });

    expect(categoryCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ order: 6 }) }));
  });

  it("отклоняет дубликат названия понятной ошибкой", async () => {
    const { ValidationFailedError } = await import("@/server/errors");
    categoryCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "5.18.0" })
    );

    await expect(createDivisionCategory({ name: "Любители" })).rejects.toBeInstanceOf(ValidationFailedError);
  });
});

describe("setDivisionCategoryActive()", () => {
  it("не удаляет строку — только переключает isActive, с аудитом", async () => {
    findUniqueOrThrow.mockResolvedValue({ id: "cat1", isActive: true });
    categoryUpdate.mockResolvedValue({ id: "cat1", isActive: false });

    await setDivisionCategoryActive("cat1", false);

    expect(categoryUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "cat1" }, data: { isActive: false } })
    );
    expect(auditCreate).toHaveBeenCalledOnce();
  });
});
