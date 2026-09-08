import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Actor } from "@/server/rbac/actor";

const requirePermissionMock = vi.fn();
vi.mock("@/server/rbac/authorize", () => ({ requirePermission: (...a: unknown[]) => requirePermissionMock(...a) }));

const registrationFindUniqueOrThrow = vi.fn();
const registrationUpdate = vi.fn();
const auditCreate = vi.fn();

const fakeTx = {
  registration: { update: registrationUpdate },
  auditLog: { create: auditCreate },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    registration: { findUniqueOrThrow: (...a: unknown[]) => registrationFindUniqueOrThrow(...a) },
    $transaction: (fn: (tx: typeof fakeTx) => unknown) => fn(fakeTx),
  },
}));

const { setRegistrationPayment } = await import("@/server/competition/payment");

const actor: Actor = { userId: "u1", email: "a@b.by", globalPermissions: new Set(), permissionsByCompetition: new Map() };

beforeEach(() => {
  requirePermissionMock.mockReset().mockResolvedValue(actor);
  registrationFindUniqueOrThrow.mockReset();
  registrationUpdate.mockReset();
  auditCreate.mockReset();
});

describe("setRegistrationPayment() — 2026-09-09", () => {
  it("проверяет registration:manage ИМЕННО для этого competitionId", async () => {
    registrationFindUniqueOrThrow.mockResolvedValue({ id: "reg1", competitionId: "comp1", isPaid: false, paidAt: null });
    registrationUpdate.mockResolvedValue({ isPaid: true, paidAt: new Date("2026-09-09T00:00:00Z") });

    await setRegistrationPayment("reg1", true);

    expect(requirePermissionMock).toHaveBeenCalledWith("registration:manage", "comp1");
  });

  it("isPaid=true проставляет paidAt (не null)", async () => {
    registrationFindUniqueOrThrow.mockResolvedValue({ id: "reg1", competitionId: "comp1", isPaid: false, paidAt: null });
    registrationUpdate.mockResolvedValue({ isPaid: true, paidAt: new Date() });

    await setRegistrationPayment("reg1", true);

    expect(registrationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "reg1" }, data: expect.objectContaining({ isPaid: true, paidAt: expect.any(Date) }) })
    );
  });

  it("isPaid=false сбрасывает paidAt в null, с аудитом до/после", async () => {
    const paidAt = new Date("2026-09-01T00:00:00Z");
    registrationFindUniqueOrThrow.mockResolvedValue({ id: "reg1", competitionId: "comp1", isPaid: true, paidAt });
    registrationUpdate.mockResolvedValue({ isPaid: false, paidAt: null });

    await setRegistrationPayment("reg1", false);

    expect(registrationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isPaid: false, paidAt: null }) })
    );
    const entry = auditCreate.mock.calls[0][0].data;
    expect(entry.action).toBe("registration.set_payment");
    expect(entry.before).toEqual({ isPaid: true, paidAt });
    expect(entry.after).toEqual({ isPaid: false, paidAt: null });
  });
});
