import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Actor } from "@/server/rbac/actor";

const requirePermissionMock = vi.fn();
vi.mock("@/server/rbac/authorize", () => ({ requirePermission: (...a: unknown[]) => requirePermissionMock(...a) }));

const roundFindUniqueOrThrow = vi.fn();
const heatFindFirst = vi.fn();
const heatFindFirstOrThrow = vi.fn();
const heatCreate = vi.fn();
const heatDelete = vi.fn();
const auditCreate = vi.fn();

const fakeTx = {
  heat: { findFirst: heatFindFirst, create: heatCreate, delete: heatDelete },
  auditLog: { create: auditCreate },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    round: { findUniqueOrThrow: (...a: unknown[]) => roundFindUniqueOrThrow(...a), findFirstOrThrow: (...a: unknown[]) => roundFindUniqueOrThrow(...a) },
    heat: { findFirstOrThrow: (...a: unknown[]) => heatFindFirstOrThrow(...a) },
    $transaction: (fn: (tx: typeof fakeTx) => unknown) => fn(fakeTx),
  },
}));

const { createHeat, deleteHeat } = await import("@/server/competition/create-heat");
const { ValidationFailedError } = await import("@/server/errors");

const actor: Actor = { userId: "u1", email: "a@b.by", globalPermissions: new Set(), permissionsByCompetition: new Map() };

beforeEach(() => {
  requirePermissionMock.mockReset().mockResolvedValue(actor);
  roundFindUniqueOrThrow.mockReset().mockResolvedValue({ status: "DRAFT", division: { competitionId: "comp1" } });
  heatFindFirst.mockReset().mockResolvedValue(null);
  heatCreate.mockReset().mockResolvedValue({ id: "heat1", number: 1 });
  heatFindFirstOrThrow.mockReset().mockResolvedValue({
    id: "heat1",
    roundId: "round1",
    number: 2,
    status: "PENDING",
    round: { division: { competitionId: "comp1" } },
    _count: { draws: 0 },
  });
  heatDelete.mockReset();
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

describe("deleteHeat()", () => {
  it("проверяет round:create ИМЕННО для competitionId раунда захода", async () => {
    await deleteHeat("heat1");

    expect(requirePermissionMock).toHaveBeenCalledWith("round:create", "comp1");
  });

  it("удаляет пустой PENDING-заход без жеребьёвки и пишет audit", async () => {
    await deleteHeat("heat1");

    expect(heatDelete).toHaveBeenCalledWith({ where: { id: "heat1" } });
    expect(auditCreate).toHaveBeenCalledOnce();
  });

  it.each(["RUNNING", "PAUSED", "FINISHED"] as const)("отклоняет удаление захода в статусе %s", async (status) => {
    heatFindFirstOrThrow.mockResolvedValue({
      id: "heat1",
      roundId: "round1",
      number: 2,
      status,
      round: { division: { competitionId: "comp1" } },
      _count: { draws: 0 },
    });

    await expect(deleteHeat("heat1")).rejects.toBeInstanceOf(ValidationFailedError);
    expect(heatDelete).not.toHaveBeenCalled();
  });

  it("отклоняет удаление захода, для которого уже сформирована жеребьёвка", async () => {
    heatFindFirstOrThrow.mockResolvedValue({
      id: "heat1",
      roundId: "round1",
      number: 2,
      status: "PENDING",
      round: { division: { competitionId: "comp1" } },
      _count: { draws: 1 },
    });

    await expect(deleteHeat("heat1")).rejects.toBeInstanceOf(ValidationFailedError);
    expect(heatDelete).not.toHaveBeenCalled();
  });
});
