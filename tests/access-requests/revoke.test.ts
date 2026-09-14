import { describe, it, expect, vi, beforeEach } from "vitest";
import type { User } from "@prisma/client";

const isAdminMock = vi.fn();
vi.mock("@/lib/auth", () => ({ isAdmin: (...a: unknown[]) => isAdminMock(...a) }));

const logModerationMock = vi.fn();
vi.mock("@/lib/moderation", () => ({ logModeration: (...a: unknown[]) => logModerationMock(...a) }));

const accessRequestFindUnique = vi.fn();
const accessRequestUpdate = vi.fn();
const userUpdate = vi.fn();
const schoolUpdate = vi.fn();
const roleFindUnique = vi.fn();
const userRoleAssignmentDeleteMany = vi.fn();

const fakeTx = {
  accessRequest: { update: (...a: unknown[]) => accessRequestUpdate(...a) },
  user: { update: (...a: unknown[]) => userUpdate(...a) },
  school: { update: (...a: unknown[]) => schoolUpdate(...a) },
  role: { findUnique: (...a: unknown[]) => roleFindUnique(...a) },
  userRoleAssignment: { deleteMany: (...a: unknown[]) => userRoleAssignmentDeleteMany(...a) },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    accessRequest: { findUnique: (...a: unknown[]) => accessRequestFindUnique(...a) },
    $transaction: (fn: (tx: typeof fakeTx) => unknown) => fn(fakeTx),
  },
}));

const { revokeAccessRequest } = await import("@/server/access-requests/revoke");
const { AccessRequestForbiddenError, AccessRequestNotFoundError } = await import("@/server/access-requests/errors");

function makeReviewer(overrides: Partial<User> = {}): User {
  return {
    id: "admin1",
    email: "admin@example.com",
    passwordHash: null,
    supabaseUserId: null,
    role: "ADMIN",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastLoginAt: null,
    isBlocked: false,
    isVerifiedEventOrganizer: false,
    isVerifiedFestivalOrganizer: false,
    ...overrides,
  };
}

beforeEach(() => {
  isAdminMock.mockReset().mockReturnValue(true);
  logModerationMock.mockReset();
  accessRequestFindUnique.mockReset();
  accessRequestUpdate.mockReset();
  userUpdate.mockReset();
  schoolUpdate.mockReset();
  roleFindUnique.mockReset();
  userRoleAssignmentDeleteMany.mockReset();
});

describe("revokeAccessRequest", () => {
  it("EVENT_ORGANIZER — снимает флаг isVerifiedEventOrganizer", async () => {
    accessRequestFindUnique.mockResolvedValue({ id: "r1", type: "EVENT_ORGANIZER", userId: "u1", status: "APPROVED", payload: {} });

    await revokeAccessRequest({ reviewer: makeReviewer(), requestId: "r1", reason: "нарушение правил" });

    expect(userUpdate).toHaveBeenCalledWith({ where: { id: "u1" }, data: { isVerifiedEventOrganizer: false } });
    expect(accessRequestUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "REVOKED", reviewComment: "нарушение правил" }) })
    );
  });

  it("SCHOOL_HEAD — отвязывает владельца именно у той школы, что была создана этой заявкой (resolvedSchoolId)", async () => {
    accessRequestFindUnique.mockResolvedValue({
      id: "r2",
      type: "SCHOOL_HEAD",
      userId: "u2",
      status: "APPROVED",
      payload: { resolvedSchoolId: "school-42" },
    });

    await revokeAccessRequest({ reviewer: makeReviewer(), requestId: "r2", reason: "школа закрылась" });

    expect(schoolUpdate).toHaveBeenCalledWith({
      where: { id: "school-42" },
      data: { ownerUserId: null, verificationStatus: "COMMUNITY" },
    });
  });

  it("COMPETITION_ORGANIZER — удаляет UserRoleAssignment, не трогая уже созданные соревнования", async () => {
    accessRequestFindUnique.mockResolvedValue({ id: "r3", type: "COMPETITION_ORGANIZER", userId: "u3", status: "APPROVED", payload: {} });
    roleFindUnique.mockResolvedValue({ id: "role-comp-org" });

    await revokeAccessRequest({ reviewer: makeReviewer(), requestId: "r3", reason: "по запросу" });

    expect(userRoleAssignmentDeleteMany).toHaveBeenCalledWith({ where: { userId: "u3", roleId: "role-comp-org" } });
  });

  it("не-админ получает AccessRequestForbiddenError", async () => {
    isAdminMock.mockReturnValue(false);

    await expect(revokeAccessRequest({ reviewer: makeReviewer(), requestId: "r4", reason: "x" })).rejects.toThrow(
      AccessRequestForbiddenError
    );
  });

  it("заявка не найдена — AccessRequestNotFoundError", async () => {
    accessRequestFindUnique.mockResolvedValue(null);

    await expect(revokeAccessRequest({ reviewer: makeReviewer(), requestId: "ghost", reason: "x" })).rejects.toThrow(
      AccessRequestNotFoundError
    );
  });

  it("нельзя отозвать заявку, которая не в статусе APPROVED", async () => {
    accessRequestFindUnique.mockResolvedValue({ id: "r5", type: "EVENT_ORGANIZER", userId: "u5", status: "PENDING", payload: {} });

    await expect(revokeAccessRequest({ reviewer: makeReviewer(), requestId: "r5", reason: "x" })).rejects.toThrow(
      AccessRequestForbiddenError
    );
  });
});
