import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Actor } from "@/server/rbac/actor";

const requirePermissionMock = vi.fn();
vi.mock("@/server/rbac/authorize", () => ({ requirePermission: (...a: unknown[]) => requirePermissionMock(...a) }));

const roundFindUniqueOrThrow = vi.fn();
const heatFindFirst = vi.fn();
const heatCreate = vi.fn();
const auditCreate = vi.fn();

const fakeTx = {
  heat: { findFirst: heatFindFirst, create: heatCreate },
  auditLog: { create: auditCreate },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    round: { findUniqueOrThrow: (...a: unknown[]) => roundFindUniqueOrThrow(...a) },
    $transaction: (fn: (tx: typeof fakeTx) => unknown) => fn(fakeTx),
  },
}));

const { createHeat } = await import("@/server/competition/create-heat");

const actor: Actor = { userId: "u1", email: "a@b.by", globalPermissions: new Set(), permissionsByCompetition: new Map() };

beforeEach(() => {
  requirePermissionMock.mockReset().mockResolvedValue(actor);
  roundFindUniqueOrThrow.mockReset().mockResolvedValue({ division: { competitionId: "comp1" } });
  heatFindFirst.mockReset().mockResolvedValue(null);
  heatCreate.mockReset().mockResolvedValue({ id: "heat1", number: 1 });
  auditCreate.mockReset();
});

describe("createHeat()", () => {
  it("проверяет round:create ИМЕННО для competitionId раунда", async () => {
    await createHeat("round1");

    expect(requirePermissionMock).toHaveBeenCalledWith("round:create", "comp1");
  });

  it("первый заезд раунда получает number 1", async () => {
    heatFindFirst.mockResolvedValue(null);

    await createHeat("round1");

    expect(heatCreate).toHaveBeenCalledWith(expect.objectContaining({ data: { roundId: "round1", number: 1 } }));
    expect(auditCreate).toHaveBeenCalledOnce();
  });

  it("number = максимальный существующий + 1 в рамках раунда", async () => {
    heatFindFirst.mockResolvedValue({ number: 4 });

    await createHeat("round1");

    expect(heatCreate).toHaveBeenCalledWith(expect.objectContaining({ data: { roundId: "round1", number: 5 } }));
  });
});
