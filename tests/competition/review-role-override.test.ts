import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Actor } from "@/server/rbac/actor";

const requirePermissionMock = vi.fn();
vi.mock("@/server/rbac/authorize", () => ({ requirePermission: (...a: unknown[]) => requirePermissionMock(...a) }));

const registrationFindUniqueOrThrow = vi.fn();
const registrationUpdate = vi.fn();
const auditCreate = vi.fn();

const fakeTx = { registration: { update: registrationUpdate }, auditLog: { create: auditCreate } };

vi.mock("@/lib/prisma", () => ({
  prisma: {
    registration: { findUniqueOrThrow: (...a: unknown[]) => registrationFindUniqueOrThrow(...a) },
    $transaction: (fn: (tx: typeof fakeTx) => unknown) => fn(fakeTx),
  },
}));

const { reviewRoleOverride } = await import("@/server/competition/review-role-override");
const { ValidationFailedError } = await import("@/server/errors");

const actor: Actor = { userId: "reviewer1", email: "r@b.by", globalPermissions: new Set(), permissionsByCompetition: new Map() };

beforeEach(() => {
  requirePermissionMock.mockReset().mockResolvedValue(actor);
  registrationFindUniqueOrThrow.mockReset();
  registrationUpdate.mockReset();
  auditCreate.mockReset();
});

describe("reviewRoleOverride()", () => {
  it("проверяет registration:role_override_review ИМЕННО для этого competitionId", async () => {
    registrationFindUniqueOrThrow.mockResolvedValue({
      id: "reg1",
      competitionId: "comp1",
      role: "LEADER",
      requestedRole: "FOLLOWER",
      roleOverrideStatus: "PENDING",
    });
    registrationUpdate.mockResolvedValue({ role: "FOLLOWER", roleOverrideStatus: "APPROVED" });

    await reviewRoleOverride("reg1", "APPROVE");

    expect(requirePermissionMock).toHaveBeenCalledWith("registration:role_override_review", "comp1");
  });

  it("APPROVE переключает действующую роль на запрошенную", async () => {
    registrationFindUniqueOrThrow.mockResolvedValue({
      id: "reg1",
      competitionId: "comp1",
      role: "LEADER",
      requestedRole: "FOLLOWER",
      roleOverrideStatus: "PENDING",
    });
    registrationUpdate.mockResolvedValue({ role: "FOLLOWER", roleOverrideStatus: "APPROVED" });

    await reviewRoleOverride("reg1", "APPROVE");

    expect(registrationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ role: "FOLLOWER", roleOverrideStatus: "APPROVED" }) })
    );
    expect(auditCreate).toHaveBeenCalledOnce();
  });

  it("REJECT оставляет действующую роль (подсказку по полу) без изменений", async () => {
    registrationFindUniqueOrThrow.mockResolvedValue({
      id: "reg1",
      competitionId: "comp1",
      role: "LEADER",
      requestedRole: "FOLLOWER",
      roleOverrideStatus: "PENDING",
    });
    registrationUpdate.mockResolvedValue({ role: "LEADER", roleOverrideStatus: "REJECTED" });

    await reviewRoleOverride("reg1", "REJECT");

    expect(registrationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ role: "LEADER", roleOverrideStatus: "REJECTED" }) })
    );
  });

  it("отклоняет повторное рассмотрение уже решённого запроса", async () => {
    registrationFindUniqueOrThrow.mockResolvedValue({
      id: "reg1",
      competitionId: "comp1",
      role: "FOLLOWER",
      requestedRole: "FOLLOWER",
      roleOverrideStatus: "APPROVED",
    });

    await expect(reviewRoleOverride("reg1", "APPROVE")).rejects.toBeInstanceOf(ValidationFailedError);
    expect(registrationUpdate).not.toHaveBeenCalled();
  });
});
