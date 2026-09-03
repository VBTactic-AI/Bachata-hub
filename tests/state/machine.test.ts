import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Actor } from "@/server/rbac/actor";

// transition() зависит только от prisma.$transaction (сама запись статуса
// приходит через инжектируемый applyUpdate, а не через модели Prisma
// напрямую) — мокаем именно эту точку входа, без реальной БД.
const auditLogCreate = vi.fn();
const fakeTx = { auditLog: { create: auditLogCreate } };
const transactionMock = vi.fn((fn: (tx: typeof fakeTx) => Promise<unknown>) => fn(fakeTx));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: (fn: any) => transactionMock(fn) } }));

const { transition } = await import("@/server/state/machine");
const { InvalidStateTransitionError, ConcurrentModificationError } = await import("@/server/errors");

type S = "DRAFT" | "READY" | "RUNNING";
const TABLE = { DRAFT: ["READY"], READY: ["RUNNING"], RUNNING: [] } as const;

const actor: Actor = {
  userId: "u1",
  email: "a@b.by",
  globalPermissions: new Set(["competition:update"]),
  permissionsByCompetition: new Map(),
};

beforeEach(() => {
  auditLogCreate.mockReset();
  transactionMock.mockClear();
});

describe("transition()", () => {
  it("выполняет допустимый переход и пишет audit log", async () => {
    const applyUpdate = vi.fn().mockResolvedValue({
      before: { status: "DRAFT" },
      after: { status: "READY" },
      updatedCount: 1,
    });

    await transition<S>({
      entityType: "TestEntity",
      entityId: "e1",
      table: TABLE,
      currentStatus: "DRAFT",
      statusVersion: 1,
      to: "READY",
      actor,
      applyUpdate,
    });

    expect(applyUpdate).toHaveBeenCalledOnce();
    expect(auditLogCreate).toHaveBeenCalledOnce();
    const auditData = auditLogCreate.mock.calls[0][0].data;
    expect(auditData.entityType).toBe("TestEntity");
    expect(auditData.entityId).toBe("e1");
    expect(auditData.actorId).toBe("u1");
  });

  it("отклоняет недопустимый переход ДО обращения к БД", async () => {
    const applyUpdate = vi.fn();

    await expect(
      transition<S>({
        entityType: "TestEntity",
        entityId: "e1",
        table: TABLE,
        currentStatus: "DRAFT",
        statusVersion: 1,
        to: "RUNNING", // DRAFT -> RUNNING не разрешено таблицей
        actor,
        applyUpdate,
      })
    ).rejects.toBeInstanceOf(InvalidStateTransitionError);

    expect(applyUpdate).not.toHaveBeenCalled();
    expect(auditLogCreate).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("бросает ConcurrentModificationError, если кто-то опередил (updatedCount = 0)", async () => {
    const applyUpdate = vi.fn().mockResolvedValue({
      before: { status: "DRAFT" },
      after: { status: "READY" },
      updatedCount: 0, // проиграли гонку statusVersion
    });

    await expect(
      transition<S>({
        entityType: "TestEntity",
        entityId: "e1",
        table: TABLE,
        currentStatus: "DRAFT",
        statusVersion: 1,
        to: "READY",
        actor,
        applyUpdate,
      })
    ).rejects.toBeInstanceOf(ConcurrentModificationError);

    // Аудит не должен появиться для проигранной гонки — состояние не наше.
    expect(auditLogCreate).not.toHaveBeenCalled();
  });

  it("guard может отклонить переход до записи (напр. функциональность ещё не готова)", async () => {
    const applyUpdate = vi.fn();
    const guard = vi.fn().mockImplementation(() => {
      throw new Error("не готово");
    });

    await expect(
      transition<S>({
        entityType: "TestEntity",
        entityId: "e1",
        table: TABLE,
        currentStatus: "DRAFT",
        statusVersion: 1,
        to: "READY",
        actor,
        guard,
        applyUpdate,
      })
    ).rejects.toThrow("не готово");

    expect(applyUpdate).not.toHaveBeenCalled();
    expect(auditLogCreate).not.toHaveBeenCalled();
  });
});
