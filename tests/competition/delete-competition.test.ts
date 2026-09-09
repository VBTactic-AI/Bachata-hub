import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Actor } from "@/server/rbac/actor";

const requirePermissionMock = vi.fn();
vi.mock("@/server/rbac/authorize", () => ({ requirePermission: (...a: unknown[]) => requirePermissionMock(...a) }));

const findUniqueOrThrow = vi.fn();
const competitionDelete = vi.fn();
const auditCreate = vi.fn();

const fakeTx = {
  competition: { delete: competitionDelete },
  auditLog: { create: auditCreate },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    competition: { findUniqueOrThrow: (...a: unknown[]) => findUniqueOrThrow(...a) },
    $transaction: (fn: (tx: typeof fakeTx) => unknown) => fn(fakeTx),
  },
}));

const { deleteCompetition } = await import("@/server/competition/delete-competition");

const actor: Actor = { userId: "super1", email: "super@bachata.by", globalPermissions: new Set(), permissionsByCompetition: new Map() };

function competitionRow(overrides: Partial<{ status: string }> = {}) {
  return {
    id: "comp1",
    name: "Test Registration Flow",
    slug: "test-registration-flow",
    status: "DRAFT",
    ...overrides,
    _count: { registrations: 3, divisions: 2, members: 1 },
  };
}

beforeEach(() => {
  requirePermissionMock.mockReset().mockResolvedValue(actor);
  findUniqueOrThrow.mockReset();
  competitionDelete.mockReset();
  auditCreate.mockReset();
});

describe("deleteCompetition() — 2026-09-09", () => {
  it("требует глобальное право competition:delete (без competitionId — как competition:create)", async () => {
    findUniqueOrThrow.mockResolvedValue(competitionRow());

    await deleteCompetition("comp1", { reason: "Тестовое соревнование, создано по ошибке" });

    expect(requirePermissionMock).toHaveBeenCalledWith("competition:delete");
  });

  it("удаляет соревнование до публикации, с аудитом и указанной причиной", async () => {
    findUniqueOrThrow.mockResolvedValue(competitionRow({ status: "LIVE" }));

    await deleteCompetition("comp1", { reason: "Дубликат, создан по ошибке" });

    expect(competitionDelete).toHaveBeenCalledWith({ where: { id: "comp1" } });
    const entry = auditCreate.mock.calls[0][0].data;
    expect(entry.action).toBe("competition.delete");
    expect(entry.entityType).toBe("Competition");
    expect(entry.entityId).toBe("comp1");
    expect(entry.reason).toBe("Дубликат, создан по ошибке");
    expect(entry.before).toEqual({
      name: "Test Registration Flow",
      slug: "test-registration-flow",
      status: "LIVE",
      divisions: 2,
      registrations: 3,
      members: 1,
    });
  });

  it("отклоняет удаление опубликованного соревнования — история должна сохраняться", async () => {
    const { ValidationFailedError } = await import("@/server/errors");
    findUniqueOrThrow.mockResolvedValue(competitionRow({ status: "PUBLISHED" }));

    await expect(deleteCompetition("comp1", { reason: "Хочу удалить" })).rejects.toBeInstanceOf(ValidationFailedError);
    expect(competitionDelete).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it("отклоняет удаление уже архивированного соревнования", async () => {
    const { ValidationFailedError } = await import("@/server/errors");
    findUniqueOrThrow.mockResolvedValue(competitionRow({ status: "ARCHIVED" }));

    await expect(deleteCompetition("comp1", { reason: "Хочу удалить" })).rejects.toBeInstanceOf(ValidationFailedError);
    expect(competitionDelete).not.toHaveBeenCalled();
  });
});
