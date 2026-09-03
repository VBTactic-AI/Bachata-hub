import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Actor } from "@/server/rbac/actor";

const requirePermissionMock = vi.fn();
vi.mock("@/server/rbac/authorize", () => ({ requirePermission: (...a: unknown[]) => requirePermissionMock(...a) }));

const findFirst = vi.fn();
const findUniqueOrThrow = vi.fn();
const stageCreate = vi.fn();
const stageUpdate = vi.fn();
const auditCreate = vi.fn();

const fakeTx = {
  roundStageCatalog: { create: stageCreate, findUniqueOrThrow, update: stageUpdate },
  auditLog: { create: auditCreate },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    roundStageCatalog: { findFirst: (...a: unknown[]) => findFirst(...a) },
    $transaction: (fn: (tx: typeof fakeTx) => unknown) => fn(fakeTx),
  },
}));

const { createRoundStage, updateRoundStage } = await import("@/server/competition/round-stage");
const { Prisma } = await import("@prisma/client");

const actor: Actor = { userId: "u1", email: "a@b.by", globalPermissions: new Set(), permissionsByCompetition: new Map() };

beforeEach(() => {
  requirePermissionMock.mockReset().mockResolvedValue(actor);
  findFirst.mockReset().mockResolvedValue(null);
  findUniqueOrThrow.mockReset();
  stageCreate.mockReset();
  stageUpdate.mockReset();
  auditCreate.mockReset();
});

describe("createRoundStage()", () => {
  it("требует глобальное право round_stage:manage (без competitionId — справочник общий)", async () => {
    stageCreate.mockResolvedValue({ id: "st1", name: "Финал", order: 1, defaultAdvanceCount: 1 });
    await createRoundStage({ name: "Финал", defaultAdvanceCount: 1 });
    expect(requirePermissionMock).toHaveBeenCalledWith("round_stage:manage");
  });

  it("новый этап получает следующий порядковый номер", async () => {
    findFirst.mockResolvedValue({ order: 3 });
    stageCreate.mockResolvedValue({ id: "st2", name: "Финал", order: 4, defaultAdvanceCount: 1 });

    await createRoundStage({ name: "Финал", defaultAdvanceCount: 1 });

    expect(stageCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ order: 4 }) }));
  });

  it("отклоняет дубликат названия понятной ошибкой", async () => {
    const { ValidationFailedError } = await import("@/server/errors");
    stageCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "5.18.0" })
    );

    await expect(createRoundStage({ name: "Финал", defaultAdvanceCount: 1 })).rejects.toBeInstanceOf(
      ValidationFailedError
    );
  });
});

describe("updateRoundStage()", () => {
  beforeEach(() => {
    findUniqueOrThrow.mockResolvedValue({ id: "st1", name: "Четвертьфинал", defaultAdvanceCount: 8, isActive: true });
    stageUpdate.mockResolvedValue({ id: "st1", name: "Четвертьфинал", defaultAdvanceCount: 8, isActive: true });
  });

  it("не удаляет строку — только переключает isActive, с аудитом", async () => {
    stageUpdate.mockResolvedValue({ id: "st1", name: "Четвертьфинал", defaultAdvanceCount: 8, isActive: false });

    await updateRoundStage("st1", { isActive: false });

    expect(stageUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "st1" },
        data: expect.objectContaining({ isActive: false, name: undefined, defaultAdvanceCount: undefined }),
      })
    );
    expect(auditCreate).toHaveBeenCalledOnce();
  });

  it("позволяет поправить название и число проходящих у уже существующего этапа", async () => {
    stageUpdate.mockResolvedValue({ id: "st1", name: "1/4 финала", defaultAdvanceCount: 6, isActive: true });

    await updateRoundStage("st1", { name: "1/4 финала", defaultAdvanceCount: 6 });

    expect(stageUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: "1/4 финала", defaultAdvanceCount: 6 }) })
    );
    const auditData = auditCreate.mock.calls[0][0].data;
    expect(auditData.before).toEqual({ name: "Четвертьфинал", defaultAdvanceCount: 8, isActive: true });
    expect(auditData.after).toEqual({ name: "1/4 финала", defaultAdvanceCount: 6, isActive: true });
  });

  it("отклоняет переименование в уже занятое название понятной ошибкой", async () => {
    const { ValidationFailedError } = await import("@/server/errors");
    stageUpdate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "5.18.0" })
    );

    await expect(updateRoundStage("st1", { name: "Полуфинал" })).rejects.toBeInstanceOf(ValidationFailedError);
  });
});
