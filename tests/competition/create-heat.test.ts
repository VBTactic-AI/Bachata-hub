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
const { ValidationFailedError } = await import("@/server/errors");

const actor: Actor = { userId: "u1", email: "a@b.by", globalPermissions: new Set(), permissionsByCompetition: new Map() };

beforeEach(() => {
  requirePermissionMock.mockReset().mockResolvedValue(actor);
  roundFindUniqueOrThrow.mockReset().mockResolvedValue({ status: "DRAFT", division: { competitionId: "comp1" } });
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

  // FLOW-001: после DRAW_LOCKED у каждого захода уже обязана быть
  // жеребьёвка — новый заезд без списка нарушил бы это молча, и раньше
  // сервер это никак не проверял (только кнопка в UI была спрятана).
  it.each(["DRAW_LOCKED", "RUNNING", "PAUSED", "FINISHED", "SCORING", "COMPLETED"] as const)(
    "отклоняет создание заезда, если раунд уже в статусе %s",
    async (status) => {
      roundFindUniqueOrThrow.mockResolvedValue({ status, division: { competitionId: "comp1" } });

      await expect(createHeat("round1")).rejects.toBeInstanceOf(ValidationFailedError);
      expect(heatCreate).not.toHaveBeenCalled();
    }
  );

  it.each(["DRAFT", "READY", "DRAWING"] as const)("разрешает создание заезда в статусе %s", async (status) => {
    roundFindUniqueOrThrow.mockResolvedValue({ status, division: { competitionId: "comp1" } });

    await createHeat("round1");

    expect(heatCreate).toHaveBeenCalled();
  });
});
