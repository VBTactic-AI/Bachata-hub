import { describe, it, expect, vi, beforeEach } from "vitest";
import type { User } from "@prisma/client";

const isAdminMock = vi.fn();
vi.mock("@/lib/auth", () => ({ isAdmin: (...a: unknown[]) => isAdminMock(...a) }));

const logModerationMock = vi.fn();
vi.mock("@/lib/moderation", () => ({ logModeration: (...a: unknown[]) => logModerationMock(...a) }));

const emitDomainEventMock = vi.fn();
vi.mock("@/server/notifications/emit-domain-event", () => ({
  emitDomainEvent: (...a: unknown[]) => emitDomainEventMock(...a),
}));

const accessRequestFindUnique = vi.fn();
const accessRequestUpdate = vi.fn();
const userUpdate = vi.fn();
const schoolCreate = vi.fn();
const schoolUpdate = vi.fn();
const schoolFindUniqueTopLevel = vi.fn(); // используется uniqueSlug() (глобальный prisma, не tx)
const roleFindUniqueOrThrow = vi.fn();
const userRoleAssignmentUpsert = vi.fn();

const fakeTx = {
  accessRequest: { update: (...a: unknown[]) => accessRequestUpdate(...a) },
  user: { update: (...a: unknown[]) => userUpdate(...a) },
  school: { create: (...a: unknown[]) => schoolCreate(...a), update: (...a: unknown[]) => schoolUpdate(...a) },
  role: { findUniqueOrThrow: (...a: unknown[]) => roleFindUniqueOrThrow(...a) },
  userRoleAssignment: { upsert: (...a: unknown[]) => userRoleAssignmentUpsert(...a) },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    accessRequest: { findUnique: (...a: unknown[]) => accessRequestFindUnique(...a) },
    school: { findUnique: (...a: unknown[]) => schoolFindUniqueTopLevel(...a) },
    $transaction: (fn: (tx: typeof fakeTx) => unknown) => fn(fakeTx),
  },
}));

const { reviewAccessRequest } = await import("@/server/access-requests/review");
const { AccessRequestAlreadyReviewedError, AccessRequestForbiddenError, AccessRequestNotFoundError } = await import(
  "@/server/access-requests/errors"
);

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
  emitDomainEventMock.mockReset();
  accessRequestFindUnique.mockReset();
  accessRequestUpdate.mockReset();
  userUpdate.mockReset();
  schoolCreate.mockReset();
  schoolUpdate.mockReset();
  schoolFindUniqueTopLevel.mockReset().mockResolvedValue(null);
  roleFindUniqueOrThrow.mockReset();
  userRoleAssignmentUpsert.mockReset();
});

describe("reviewAccessRequest — EVENT_ORGANIZER", () => {
  it("approve выставляет isVerifiedEventOrganizer=true", async () => {
    accessRequestFindUnique.mockResolvedValue({ id: "r1", type: "EVENT_ORGANIZER", userId: "u1", status: "PENDING", payload: {} });

    await reviewAccessRequest({ reviewer: makeReviewer(), requestId: "r1", action: "approve" });

    expect(userUpdate).toHaveBeenCalledWith({ where: { id: "u1" }, data: { isVerifiedEventOrganizer: true } });
    expect(logModerationMock).toHaveBeenCalledWith(expect.objectContaining({ id: "admin1" }), "ACCESS_REQUEST", "r1", "approve", undefined);
  });
});

describe("reviewAccessRequest — FESTIVAL_ORGANIZER", () => {
  it("approve выставляет isVerifiedFestivalOrganizer=true", async () => {
    accessRequestFindUnique.mockResolvedValue({ id: "r2", type: "FESTIVAL_ORGANIZER", userId: "u2", status: "PENDING", payload: {} });

    await reviewAccessRequest({ reviewer: makeReviewer(), requestId: "r2", action: "approve" });

    expect(userUpdate).toHaveBeenCalledWith({ where: { id: "u2" }, data: { isVerifiedFestivalOrganizer: true } });
  });
});

describe("reviewAccessRequest — SCHOOL_HEAD", () => {
  it("approve без linkToSchoolId создаёт новую School, сохраняет resolvedSchoolId, эмитит SCHOOL_VERIFIED", async () => {
    accessRequestFindUnique.mockResolvedValue({
      id: "r3",
      type: "SCHOOL_HEAD",
      userId: "u3",
      status: "PENDING",
      cityId: "city1",
      description: "desc",
      payload: { schoolName: "Bachata Warsaw", teachingStyles: ["Bachata"] },
    });
    schoolCreate.mockResolvedValue({ id: "school1", slug: "bachata-warsaw" });

    await reviewAccessRequest({ reviewer: makeReviewer(), requestId: "r3", action: "approve" });

    expect(schoolCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: "Bachata Warsaw", cityId: "city1", ownerUserId: "u3", verificationStatus: "VERIFIED" }),
      })
    );
    expect(accessRequestUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ payload: expect.objectContaining({ resolvedSchoolId: "school1" }) }) })
    );
    expect(emitDomainEventMock).toHaveBeenCalledWith(
      fakeTx,
      expect.objectContaining({ type: "SCHOOL_VERIFIED", idempotencyKey: "SCHOOL_VERIFIED:r3" })
    );
  });

  it("approve с linkToSchoolId привязывает к существующей школе вместо создания новой", async () => {
    accessRequestFindUnique.mockResolvedValue({
      id: "r4",
      type: "SCHOOL_HEAD",
      userId: "u4",
      status: "NEEDS_INFO",
      cityId: "city1",
      description: "desc",
      payload: { schoolName: "X", teachingStyles: [] },
    });
    schoolUpdate.mockResolvedValue({ id: "existing-school", slug: "existing" });

    await reviewAccessRequest({ reviewer: makeReviewer(), requestId: "r4", action: "approve", linkToSchoolId: "existing-school" });

    expect(schoolCreate).not.toHaveBeenCalled();
    expect(schoolUpdate).toHaveBeenCalledWith({
      where: { id: "existing-school" },
      data: { ownerUserId: "u4", verificationStatus: "VERIFIED" },
    });
  });
});

describe("reviewAccessRequest — COMPETITION_ORGANIZER", () => {
  it("approve создаёт UserRoleAssignment на роль COMPETITION_ORGANIZER", async () => {
    accessRequestFindUnique.mockResolvedValue({ id: "r5", type: "COMPETITION_ORGANIZER", userId: "u5", status: "PENDING", payload: {} });
    roleFindUniqueOrThrow.mockResolvedValue({ id: "role-comp-org" });

    await reviewAccessRequest({ reviewer: makeReviewer(), requestId: "r5", action: "approve" });

    expect(userRoleAssignmentUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: { userId: "u5", roleId: "role-comp-org", grantedById: "admin1" } })
    );
  });
});

describe("reviewAccessRequest — общие правила", () => {
  it("reject не выдаёт доступ", async () => {
    accessRequestFindUnique.mockResolvedValue({ id: "r6", type: "EVENT_ORGANIZER", userId: "u6", status: "PENDING", payload: {} });

    await reviewAccessRequest({ reviewer: makeReviewer(), requestId: "r6", action: "reject", comment: "не убедительно" });

    expect(userUpdate).not.toHaveBeenCalled();
    expect(accessRequestUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "REJECTED" }) }));
  });

  it("needs_info не выдаёт доступ и сохраняет статус NEEDS_INFO", async () => {
    accessRequestFindUnique.mockResolvedValue({ id: "r6b", type: "EVENT_ORGANIZER", userId: "u6b", status: "PENDING", payload: {} });

    await reviewAccessRequest({ reviewer: makeReviewer(), requestId: "r6b", action: "needs_info", comment: "нужна ссылка" });

    expect(userUpdate).not.toHaveBeenCalled();
    expect(accessRequestUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "NEEDS_INFO" }) }));
  });

  it("не-админ получает AccessRequestForbiddenError", async () => {
    isAdminMock.mockReturnValue(false);

    await expect(reviewAccessRequest({ reviewer: makeReviewer(), requestId: "r7", action: "approve" })).rejects.toThrow(
      AccessRequestForbiddenError
    );
  });

  it("заявка не найдена — AccessRequestNotFoundError", async () => {
    accessRequestFindUnique.mockResolvedValue(null);

    await expect(reviewAccessRequest({ reviewer: makeReviewer(), requestId: "ghost", action: "approve" })).rejects.toThrow(
      AccessRequestNotFoundError
    );
  });

  it("уже рассмотренная заявка — AccessRequestAlreadyReviewedError", async () => {
    accessRequestFindUnique.mockResolvedValue({ id: "r8", type: "EVENT_ORGANIZER", userId: "u8", status: "APPROVED", payload: {} });

    await expect(reviewAccessRequest({ reviewer: makeReviewer(), requestId: "r8", action: "approve" })).rejects.toThrow(
      AccessRequestAlreadyReviewedError
    );
  });
});
