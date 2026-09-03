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

const { createRoundStage, setRoundStageActive } = await import("@/server/competition/round-stage");
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

describe("setRoundStageActive()", () => {
  it("не удаляет строку — только переключает isActive, с аудитом", async () => {
    findUniqueOrThrow.mockResolvedValue({ id: "st1", isActive: true });
    stageUpdate.mockResolvedValue({ id: "st1", isActive: false });

    await setRoundStageActive("st1", false);

    expect(stageUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "st1" }, data: { isActive: false } }));
    expect(auditCreate).toHaveBeenCalledOnce();
  });
});
