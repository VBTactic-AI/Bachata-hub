import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Actor } from "@/server/rbac/actor";

const requirePermissionMock = vi.fn();
vi.mock("@/server/rbac/authorize", () => ({ requirePermission: (...a: unknown[]) => requirePermissionMock(...a) }));

const dancerFindMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { dancer: { findMany: (...a: unknown[]) => dancerFindMany(...a) } },
}));

const { searchDancersByName } = await import("@/server/competition/search-dancers");

const actor: Actor = { userId: "u1", email: "a@b.by", globalPermissions: new Set(), permissionsByCompetition: new Map() };

beforeEach(() => {
  requirePermissionMock.mockReset().mockResolvedValue(actor);
  dancerFindMany.mockReset().mockResolvedValue([]);
});

describe("searchDancersByName()", () => {
  it("проверяет registration:manage ИМЕННО для этого competitionId", async () => {
    await searchDancersByName("comp1", "Тихон");
    expect(requirePermissionMock).toHaveBeenCalledWith("registration:manage", "comp1");
  });

  it("слишком короткий запрос (< 2 символов) не бьёт в базу", async () => {
    const result = await searchDancersByName("comp1", "Т");
    expect(dancerFindMany).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it("'Тихон*' ищет по startsWith", async () => {
    await searchDancersByName("comp1", "Тихон*");
    expect(dancerFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { displayName: { startsWith: "Тихон", mode: "insensitive" } },
      })
    );
  });

  it("'*чук' ищет по endsWith", async () => {
    await searchDancersByName("comp1", "*чук");
    expect(dancerFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { displayName: { endsWith: "чук", mode: "insensitive" } },
      })
    );
  });

  it("без '*' ищет по подстроке где угодно в имени", async () => {
    await searchDancersByName("comp1", "Тихон");
    expect(dancerFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { displayName: { contains: "Тихон", mode: "insensitive" } },
      })
    );
  });

  it("возвращает email и пол вместе с именем", async () => {
    dancerFindMany.mockResolvedValue([
      { id: "d1", displayName: "Тихончук Иван", gender: "MALE", user: { email: "ivan@b.by" } },
    ]);

    const result = await searchDancersByName("comp1", "Тихон*");

    expect(result).toEqual([
      { dancerId: "d1", displayName: "Тихончук Иван", gender: "MALE", email: "ivan@b.by" },
    ]);
  });
});
