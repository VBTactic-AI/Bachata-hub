import { describe, it, expect, vi, beforeEach } from "vitest";
import type { User } from "@prisma/client";

const festivalFindUnique = vi.fn();
const reviewFindUnique = vi.fn();
const reviewFindMany = vi.fn();
const reviewCreate = vi.fn();
const reviewUpdate = vi.fn();
const eventTeamMemberFindUnique = vi.fn();
const logModerationMock = vi.fn();

vi.mock("@/lib/moderation", () => ({ logModeration: (...a: unknown[]) => logModerationMock(...a) }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    festival: { findUnique: (...a: unknown[]) => festivalFindUnique(...a) },
    review: {
      findUnique: (...a: unknown[]) => reviewFindUnique(...a),
      findMany: (...a: unknown[]) => reviewFindMany(...a),
      create: (...a: unknown[]) => reviewCreate(...a),
      update: (...a: unknown[]) => reviewUpdate(...a),
    },
    eventTeamMember: { findUnique: (...a: unknown[]) => eventTeamMemberFindUnique(...a) },
  },
}));

const {
  submitFestivalReview,
  moderateFestivalReview,
  listFestivalReviews,
  listPublicFestivalReviews,
  FestivalReviewValidationError,
} = await import("@/server/events/festival-review-service");
const { RegistrationForbiddenError, RegistrationNotFoundError } = await import("@/server/events/registration-service");

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "user1",
    email: "user1@example.com",
    passwordHash: null,
    supabaseUserId: null,
    role: "ORGANIZER",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastLoginAt: null,
    isBlocked: false,
    isVerifiedEventOrganizer: false,
    isVerifiedFestivalOrganizer: false,
    ...overrides,
  } as User;
}

const owner = makeUser({ id: "owner1" });
const guest = makeUser({ id: "guest1" });
const baseFestival = { id: "fest1", createdById: "owner1", eventId: null as string | null };
const baseReview = { id: "review1", festivalId: "fest1", schoolId: null, authorId: "guest1", rating: 5, text: "Отлично!", moderationStatus: "PENDING", moderatedById: null };

beforeEach(() => {
  vi.clearAllMocks();
  festivalFindUnique.mockResolvedValue({ ...baseFestival });
  reviewFindUnique.mockResolvedValue({ ...baseReview, festival: { ...baseFestival } });
  reviewCreate.mockImplementation((args) => Promise.resolve({ ...baseReview, ...args.data }));
  reviewUpdate.mockImplementation((args) => Promise.resolve({ ...baseReview, ...args.data }));
  eventTeamMemberFindUnique.mockResolvedValue(null);
});

describe("submitFestivalReview()", () => {
  it("NotFound, если фестиваля нет", async () => {
    festivalFindUnique.mockResolvedValue(null);
    await expect(submitFestivalReview("missing", guest, { rating: 5, text: "Круто" })).rejects.toBeInstanceOf(RegistrationNotFoundError);
  });

  it("не требует доступа к фестивалю — это действие гостя, не организатора", async () => {
    // guest не владелец и не член команды — но submitFestivalReview не делает hasFestivalAccess-проверку
    await submitFestivalReview("fest1", guest, { rating: 5, text: "Круто" });
    expect(reviewCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ festivalId: "fest1", authorId: "guest1", moderationStatus: "PENDING" }) })
    );
  });

  it("оценка должна быть от 1 до 5", async () => {
    await expect(submitFestivalReview("fest1", guest, { rating: 0, text: "X" })).rejects.toBeInstanceOf(FestivalReviewValidationError);
    await expect(submitFestivalReview("fest1", guest, { rating: 6, text: "X" })).rejects.toBeInstanceOf(FestivalReviewValidationError);
    await expect(submitFestivalReview("fest1", guest, { rating: 2.5, text: "X" })).rejects.toBeInstanceOf(FestivalReviewValidationError);
  });

  it("текст отзыва обязателен", async () => {
    await expect(submitFestivalReview("fest1", guest, { rating: 5, text: "  " })).rejects.toBeInstanceOf(FestivalReviewValidationError);
  });
});

describe("moderateFestivalReview()", () => {
  it("постороннему (не организатору) запрещено", async () => {
    const stranger = makeUser({ id: "stranger1" });
    await expect(moderateFestivalReview("review1", stranger, "APPROVED")).rejects.toBeInstanceOf(RegistrationForbiddenError);
  });

  it("отзыв о школе (не о фестивале) — явная ошибка, не молчаливое обновление", async () => {
    reviewFindUnique.mockResolvedValue({ ...baseReview, festivalId: null, festival: null, schoolId: "school1" });
    await expect(moderateFestivalReview("review1", owner, "APPROVED")).rejects.toBeInstanceOf(FestivalReviewValidationError);
  });

  it("организатор фестиваля одобряет и это пишется в audit log", async () => {
    await moderateFestivalReview("review1", owner, "APPROVED");
    expect(reviewUpdate).toHaveBeenCalledWith({
      where: { id: "review1" },
      data: { moderationStatus: "APPROVED", moderatedById: "owner1" },
    });
    expect(logModerationMock).toHaveBeenCalledWith(owner, "REVIEW", "review1", "approve");
  });

  it("организатор отклоняет", async () => {
    await moderateFestivalReview("review1", owner, "REJECTED");
    expect(logModerationMock).toHaveBeenCalledWith(owner, "REVIEW", "review1", "reject");
  });
});

describe("listFestivalReviews() / listPublicFestivalReviews()", () => {
  it("постороннему запрещён доступ к очереди модерации", async () => {
    const stranger = makeUser({ id: "stranger1" });
    await expect(listFestivalReviews("fest1", stranger)).rejects.toBeInstanceOf(RegistrationForbiddenError);
  });

  it("организатор видит все отзывы (включая неодобренные)", async () => {
    reviewFindMany.mockResolvedValue([baseReview]);
    const result = await listFestivalReviews("fest1", owner);
    expect(reviewFindMany).toHaveBeenCalledWith({
      where: { festivalId: "fest1" },
      include: { author: { select: { id: true, email: true, dancer: { select: { displayName: true } } } } },
      orderBy: { createdAt: "desc" },
    });
    expect(result).toHaveLength(1);
  });

  it("публичный список фильтрует только APPROVED, без RBAC", async () => {
    reviewFindMany.mockResolvedValue([{ ...baseReview, moderationStatus: "APPROVED" }]);
    await listPublicFestivalReviews("fest1");
    expect(reviewFindMany).toHaveBeenCalledWith({
      where: { festivalId: "fest1", moderationStatus: "APPROVED" },
      orderBy: { createdAt: "desc" },
    });
  });
});
