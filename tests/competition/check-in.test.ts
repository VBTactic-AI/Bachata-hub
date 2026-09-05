import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Actor } from "@/server/rbac/actor";

const requirePermissionMock = vi.fn();
vi.mock("@/server/rbac/authorize", () => ({ requirePermission: (...a: unknown[]) => requirePermissionMock(...a) }));

const registrationFindUniqueOrThrow = vi.fn();
const checkInFindUnique = vi.fn();
const checkInCount = vi.fn();
const checkInCreate = vi.fn();
const auditCreate = vi.fn();

const fakeTx = {
  checkIn: { findUnique: checkInFindUnique, count: checkInCount, create: checkInCreate },
  auditLog: { create: auditCreate },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    registration: { findUniqueOrThrow: (...a: unknown[]) => registrationFindUniqueOrThrow(...a) },
    $transaction: (fn: (tx: typeof fakeTx) => unknown) => fn(fakeTx),
  },
}));

const { checkInRegistration } = await import("@/server/competition/check-in");
const { ValidationFailedError } = await import("@/server/errors");
const { Prisma } = await import("@prisma/client");

const actor: Actor = { userId: "u1", email: "a@b.by", globalPermissions: new Set(), permissionsByCompetition: new Map() };

beforeEach(() => {
  requirePermissionMock.mockReset().mockResolvedValue(actor);
  registrationFindUniqueOrThrow.mockReset();
  checkInFindUnique.mockReset().mockResolvedValue(null);
  checkInCount.mockReset().mockResolvedValue(0);
  checkInCreate.mockReset().mockResolvedValue({ id: "ci1", status: "CHECKED_IN", bibNumber: "1" });
  auditCreate.mockReset();
});

describe("checkInRegistration()", () => {
  it("проверяет checkin:manage ИМЕННО для этого competitionId", async () => {
    registrationFindUniqueOrThrow.mockResolvedValue({ id: "reg1", competitionId: "comp1", status: "REGISTERED" });

    await checkInRegistration("reg1");

    expect(requirePermissionMock).toHaveBeenCalledWith("checkin:manage", "comp1");
  });

  it("отклоняет check-in, если участник не в статусе REGISTERED", async () => {
    registrationFindUniqueOrThrow.mockResolvedValue({ id: "reg1", competitionId: "comp1", status: "SCRATCHED" });

    await expect(checkInRegistration("reg1")).rejects.toBeInstanceOf(ValidationFailedError);
    expect(checkInCreate).not.toHaveBeenCalled();
  });

  it("отклоняет повторный check-in", async () => {
    registrationFindUniqueOrThrow.mockResolvedValue({ id: "reg1", competitionId: "comp1", status: "REGISTERED" });
    checkInFindUnique.mockResolvedValue({ id: "existing" });

    await expect(checkInRegistration("reg1")).rejects.toBeInstanceOf(ValidationFailedError);
    expect(checkInCreate).not.toHaveBeenCalled();
  });

  it("выдаёт первый номер (1) для первого check-in соревнования", async () => {
    registrationFindUniqueOrThrow.mockResolvedValue({ id: "reg1", competitionId: "comp1", status: "REGISTERED" });
    checkInCount.mockResolvedValue(0);

    await checkInRegistration("reg1");

    expect(checkInCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ bibNumber: "1", status: "CHECKED_IN" }) })
    );
    expect(auditCreate).toHaveBeenCalledOnce();
  });

  it("late: true даёт статус LATE вместо CHECKED_IN", async () => {
    registrationFindUniqueOrThrow.mockResolvedValue({ id: "reg1", competitionId: "comp1", status: "REGISTERED" });

    await checkInRegistration("reg1", { late: true });

    expect(checkInCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "LATE" }) }));
  });

  // FLOW-003: два по-настоящему одновременных check-in могут пройти
  // предварительные findUnique-проверки (обе видят "свободно") и
  // столкнуться только на самой записи — раньше это падало общим 500.
  it("гонка на registrationId (P2002) даёт понятную ошибку, а не общий 500", async () => {
    registrationFindUniqueOrThrow.mockResolvedValue({ id: "reg1", competitionId: "comp1", status: "REGISTERED" });
    checkInCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "5.18.0", meta: { target: ["registrationId"] } })
    );

    await expect(checkInRegistration("reg1")).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it("гонка на номере участника (P2002) даёт понятную ошибку про номер", async () => {
    registrationFindUniqueOrThrow.mockResolvedValue({ id: "reg1", competitionId: "comp1", status: "REGISTERED" });
    checkInCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", {
        code: "P2002",
        clientVersion: "5.18.0",
        meta: { target: ["competitionId", "bibNumber"] },
      })
    );

    await expect(checkInRegistration("reg1")).rejects.toThrow("Не удалось выдать номер участника");
  });
});
