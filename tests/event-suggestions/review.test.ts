import { describe, it, expect, vi, beforeEach } from "vitest";
import type { User } from "@prisma/client";

// §7 ТЗ (Event Suggestions) — решение админа. Мокается @/lib/auth (isAdmin),
// @/lib/moderation (logModeration), @/server/notifications/emit-domain-event
// и @/lib/prisma — тот же приём, что и tests/access-requests/review.test.ts.

const isAdminMock = vi.fn();
vi.mock("@/lib/auth", () => ({ isAdmin: (...a: unknown[]) => isAdminMock(...a) }));

const logModerationMock = vi.fn();
vi.mock("@/lib/moderation", () => ({ logModeration: (...a: unknown[]) => logModerationMock(...a) }));

const emitDomainEventMock = vi.fn();
vi.mock("@/server/notifications/emit-domain-event", () => ({
  emitDomainEvent: (...a: unknown[]) => emitDomainEventMock(...a),
}));

const eventSuggestionFindUnique = vi.fn();
const eventSuggestionUpdate = vi.fn();

const fakeTx = {
  eventSuggestion: { update: (...a: unknown[]) => eventSuggestionUpdate(...a) },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    eventSuggestion: { findUnique: (...a: unknown[]) => eventSuggestionFindUnique(...a) },
    $transaction: (fn: (tx: typeof fakeTx) => unknown) => fn(fakeTx),
  },
}));

const { reviewEventSuggestion } = await import("@/server/event-suggestions/review");
const { EventSuggestionAlreadyReviewedError, EventSuggestionForbiddenError, EventSuggestionNotFoundError } = await import(
  "@/server/event-suggestions/errors"
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

const reviewer = makeReviewer();
const pendingSuggestion = { id: "suggestion1", status: "PENDING", title: "Bachata Party", suggestedById: "user1" };

beforeEach(() => {
  isAdminMock.mockReset().mockReturnValue(true);
  logModerationMock.mockReset();
  emitDomainEventMock.mockReset();
  eventSuggestionFindUnique.mockReset().mockResolvedValue(pendingSuggestion);
  eventSuggestionUpdate.mockReset().mockResolvedValue({ ...pendingSuggestion, status: "APPROVED" });
});

describe("reviewEventSuggestion()", () => {
  it("не admin — EventSuggestionForbiddenError, ничего не читается/не пишется", async () => {
    isAdminMock.mockReturnValue(false);
    await expect(
      reviewEventSuggestion({ reviewer, suggestionId: "suggestion1", action: "approve" })
    ).rejects.toBeInstanceOf(EventSuggestionForbiddenError);
    expect(eventSuggestionFindUnique).not.toHaveBeenCalled();
  });

  it("предложение не найдено — EventSuggestionNotFoundError", async () => {
    eventSuggestionFindUnique.mockResolvedValue(null);
    await expect(reviewEventSuggestion({ reviewer, suggestionId: "missing", action: "approve" })).rejects.toBeInstanceOf(
      EventSuggestionNotFoundError
    );
  });

  it("уже рассмотрено (не PENDING) — EventSuggestionAlreadyReviewedError", async () => {
    eventSuggestionFindUnique.mockResolvedValue({ ...pendingSuggestion, status: "APPROVED" });
    await expect(reviewEventSuggestion({ reviewer, suggestionId: "suggestion1", action: "approve" })).rejects.toBeInstanceOf(
      EventSuggestionAlreadyReviewedError
    );
    expect(eventSuggestionUpdate).not.toHaveBeenCalled();
  });

  it("approve — статус APPROVED, эмитит EVENT_SUGGESTION_APPROVED автору предложения, пишет ModerationLog", async () => {
    await reviewEventSuggestion({ reviewer, suggestionId: "suggestion1", action: "approve", reason: "выглядит реально" });

    expect(eventSuggestionUpdate).toHaveBeenCalledWith({
      where: { id: "suggestion1" },
      data: { status: "APPROVED", reviewedById: "admin1", reviewedAt: expect.any(Date), reviewComment: "выглядит реально" },
    });
    expect(emitDomainEventMock).toHaveBeenCalledWith(
      fakeTx,
      expect.objectContaining({
        type: "EVENT_SUGGESTION_APPROVED",
        payload: { entityId: "suggestion1", title: "Bachata Party", directUserId: "user1" },
        idempotencyKey: "EVENT_SUGGESTION_APPROVED:suggestion1",
      })
    );
    expect(logModerationMock).toHaveBeenCalledWith(reviewer, "EVENT_SUGGESTION", "suggestion1", "approve", "выглядит реально");
  });

  it("reject — статус REJECTED, эмитит EVENT_SUGGESTION_REJECTED", async () => {
    eventSuggestionUpdate.mockResolvedValue({ ...pendingSuggestion, status: "REJECTED" });

    await reviewEventSuggestion({ reviewer, suggestionId: "suggestion1", action: "reject", reason: "не нашли подтверждения" });

    expect(emitDomainEventMock).toHaveBeenCalledWith(
      fakeTx,
      expect.objectContaining({ type: "EVENT_SUGGESTION_REJECTED", idempotencyKey: "EVENT_SUGGESTION_REJECTED:suggestion1" })
    );
  });
});
