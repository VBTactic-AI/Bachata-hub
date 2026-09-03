import { describe, it, expect, vi, beforeEach } from "vitest";

const requirePermissionMock = vi.fn();
vi.mock("@/server/rbac/authorize", () => ({ requirePermission: (...a: unknown[]) => requirePermissionMock(...a) }));

const uniqueSlugMock = vi.fn();
vi.mock("@/lib/slug", () => ({ uniqueSlug: (...a: unknown[]) => uniqueSlugMock(...a) }));

const auditCreate = vi.fn();
const competitionCreate = vi.fn();
const memberCreate = vi.fn();
const roleFindUniqueOrThrow = vi.fn();
const fakeTx = {
  competition: { create: competitionCreate },
  competitionMember: { create: memberCreate },
  auditLog: { create: auditCreate },
};
vi.mock("@/lib/prisma", () => ({
  prisma: {
    role: { findUniqueOrThrow: (...a: unknown[]) => roleFindUniqueOrThrow(...a) },
    $transaction: (fn: (tx: typeof fakeTx) => unknown) => fn(fakeTx),
  },
}));

const { createCompetition } = await import("@/server/competition/create-competition");
const { PermissionDeniedError } = await import("@/server/errors");

beforeEach(() => {
  requirePermissionMock.mockReset();
  uniqueSlugMock.mockReset();
  competitionCreate.mockReset();
  memberCreate.mockReset();
  auditCreate.mockReset();
  roleFindUniqueOrThrow.mockReset();
});

describe("createCompetition()", () => {
  it("требует глобальное право competition:create (03 §4 — только SUPER_ADMIN)", async () => {
    requirePermissionMock.mockResolvedValue({ userId: "u1", email: "a@b.by" });
    uniqueSlugMock.mockResolvedValue("test-comp");
    roleFindUniqueOrThrow.mockResolvedValue({ id: "role-event-admin" });
    competitionCreate.mockResolvedValue({ id: "comp1", slug: "test-comp", name: "Test", status: "DRAFT" });

    await createCompetition({ name: "Test", timezone: "Europe/Minsk" } as never);

    expect(requirePermissionMock).toHaveBeenCalledWith("competition:create");
  });

  it("создатель автоматически становится EVENT_ADMIN своего соревнования", async () => {
    requirePermissionMock.mockResolvedValue({ userId: "u1", email: "a@b.by" });
    uniqueSlugMock.mockResolvedValue("test-comp");
    roleFindUniqueOrThrow.mockResolvedValue({ id: "role-event-admin" });
    competitionCreate.mockResolvedValue({ id: "comp1", slug: "test-comp", name: "Test", status: "DRAFT" });

    await createCompetition({ name: "Test", timezone: "Europe/Minsk" } as never);

    expect(memberCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ competitionId: "comp1", userId: "u1", roleId: "role-event-admin" }),
      })
    );
    expect(auditCreate).toHaveBeenCalledOnce();
  });

  it("без права — ничего не создаёт в БД (отказ до транзакции)", async () => {
    requirePermissionMock.mockRejectedValue(new PermissionDeniedError("competition:create"));

    await expect(createCompetition({ name: "Test", timezone: "Europe/Minsk" } as never)).rejects.toBeInstanceOf(
      PermissionDeniedError
    );
    expect(competitionCreate).not.toHaveBeenCalled();
    expect(memberCreate).not.toHaveBeenCalled();
  });
});
