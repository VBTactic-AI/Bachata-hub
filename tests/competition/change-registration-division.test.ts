import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Actor } from "@/server/rbac/actor";

const requirePermissionMock = vi.fn();
vi.mock("@/server/rbac/authorize", () => ({ requirePermission: (...a: unknown[]) => requirePermissionMock(...a) }));

const registrationFindUniqueOrThrow = vi.fn();
const divisionFindFirst = vi.fn();
const registrationUpdate = vi.fn();
const auditCreate = vi.fn();

const fakeTx = { registration: { update: registrationUpdate }, auditLog: { create: auditCreate } };

vi.mock("@/lib/prisma", () => ({
  prisma: {
    registration: { findUniqueOrThrow: (...a: unknown[]) => registrationFindUniqueOrThrow(...a) },
    division: { findFirst: (...a: unknown[]) => divisionFindFirst(...a) },
    $transaction: (fn: (tx: typeof fakeTx) => unknown) => fn(fakeTx),
  },
}));

const { changeRegistrationDivision } = await import("@/server/competition/change-registration-division");
const { ValidationFailedError } = await import("@/server/errors");
const { Prisma } = await import("@prisma/client");

const actor: Actor = { userId: "u1", email: "a@b.by", globalPermissions: new Set(), permissionsByCompetition: new Map() };

beforeEach(() => {
  requirePermissionMock.mockReset().mockResolvedValue(actor);
  registrationFindUniqueOrThrow.mockReset();
  divisionFindFirst.mockReset();
  registrationUpdate.mockReset();
  auditCreate.mockReset();
});

describe("changeRegistrationDivision()", () => {
  it("проверяет registration:change_division ИМЕННО для этого competitionId", async () => {
    registrationFindUniqueOrThrow.mockResolvedValue({ id: "reg1", competitionId: "comp1", divisionId: "divA" });
    divisionFindFirst.mockResolvedValue({ id: "divB", competitionId: "comp1" });
    registrationUpdate.mockResolvedValue({ divisionId: "divB" });

    await changeRegistrationDivision("reg1", "divB");

    expect(requirePermissionMock).toHaveBeenCalledWith("registration:change_division", "comp1");
  });

  it("отклоняет дивизион из другого соревнования", async () => {
    registrationFindUniqueOrThrow.mockResolvedValue({ id: "reg1", competitionId: "comp1", divisionId: "divA" });
    divisionFindFirst.mockResolvedValue(null); // не найден в comp1

    await expect(changeRegistrationDivision("reg1", "div-from-another-comp")).rejects.toBeInstanceOf(
      ValidationFailedError
    );
    expect(registrationUpdate).not.toHaveBeenCalled();
  });

  it("ничего не делает, если дивизион не меняется", async () => {
    registrationFindUniqueOrThrow.mockResolvedValue({ id: "reg1", competitionId: "comp1", divisionId: "divA" });
    divisionFindFirst.mockResolvedValue({ id: "divA", competitionId: "comp1" });

    await changeRegistrationDivision("reg1", "divA");

    expect(registrationUpdate).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it("сообщает понятной ошибкой, если участник уже зарегистрирован в целевом дивизионе", async () => {
    const { AlreadyRegisteredError } = await import("@/server/errors");
    registrationFindUniqueOrThrow.mockResolvedValue({ id: "reg1", competitionId: "comp1", divisionId: "divA" });
    divisionFindFirst.mockResolvedValue({ id: "divB", competitionId: "comp1" });
    registrationUpdate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "5.18.0" })
    );

    await expect(changeRegistrationDivision("reg1", "divB")).rejects.toBeInstanceOf(AlreadyRegisteredError);
  });
});
