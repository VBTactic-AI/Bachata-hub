import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import type { User } from "@prisma/client";

const getCurrentUserMock = vi.fn();
const isAdminMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
  isAdmin: (...a: unknown[]) => isAdminMock(...a),
}));

const logModerationMock = vi.fn();
vi.mock("@/lib/moderation", () => ({ logModeration: (...a: unknown[]) => logModerationMock(...a) }));

const emitDomainEventMock = vi.fn();
vi.mock("@/server/notifications/emit-domain-event", () => ({
  emitDomainEvent: (...a: unknown[]) => emitDomainEventMock(...a),
}));

const eventFindUnique = vi.fn();
const eventUpdate = vi.fn();

const fakeTx = {
  event: { findUnique: (...a: unknown[]) => eventFindUnique(...a), update: (...a: unknown[]) => eventUpdate(...a) },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    // QA BUG-010 — прежде чем открывать транзакцию, роут теперь проверяет
    // существование события отдельным вызовом (тот же eventFindUnique —
    // тестам, где событие "существует", ничего менять не нужно).
    event: { findUnique: (...a: unknown[]) => eventFindUnique(...a) },
    $transaction: (fn: (tx: typeof fakeTx) => unknown) => fn(fakeTx),
  },
}));

const { PATCH: patchEventModeration } = await import("@/app/api/moderation/events/[id]/route");

function makeUser(overrides: Partial<User> = {}): User {
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

function fakeRequest(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

beforeEach(() => {
  getCurrentUserMock.mockReset().mockResolvedValue(makeUser());
  isAdminMock.mockReset().mockReturnValue(true);
  logModerationMock.mockReset();
  emitDomainEventMock.mockReset();
  eventFindUnique.mockReset();
  eventUpdate.mockReset();
});

describe("PATCH /api/moderation/events/[id] — EVENT_PUBLISHED, второй возможный момент публикации", () => {
  it("approve события со status=PUBLISHED, ранее не APPROVED — эмитит EVENT_PUBLISHED", async () => {
    eventFindUnique.mockResolvedValue({ id: "event1", moderationStatus: "PENDING", status: "PUBLISHED" });
    eventUpdate.mockResolvedValue({
      id: "event1",
      slug: "s",
      title: "Bachata Night",
      cityId: "city1",
      format: "PARTY",
      schoolId: null,
      status: "PUBLISHED",
      startsAt: new Date("2026-09-20T18:00:00.000Z"),
    });

    await patchEventModeration(fakeRequest({ action: "approve" }), { params: Promise.resolve({ id: "event1" }) });

    expect(emitDomainEventMock).toHaveBeenCalledWith(
      fakeTx,
      expect.objectContaining({ type: "EVENT_PUBLISHED", idempotencyKey: "EVENT_PUBLISHED:event1" })
    );
  });

  it("approve события со status=DRAFT (организатор ещё не опубликовал) — НЕ эмитит", async () => {
    eventFindUnique.mockResolvedValue({ id: "event2", moderationStatus: "PENDING", status: "DRAFT" });
    eventUpdate.mockResolvedValue({ id: "event2", status: "DRAFT" });

    await patchEventModeration(fakeRequest({ action: "approve" }), { params: Promise.resolve({ id: "event2" }) });

    expect(emitDomainEventMock).not.toHaveBeenCalled();
  });

  it("reject — НЕ эмитит никогда", async () => {
    eventFindUnique.mockResolvedValue({ id: "event3", moderationStatus: "PENDING", status: "PUBLISHED" });
    eventUpdate.mockResolvedValue({ id: "event3", status: "PUBLISHED" });

    await patchEventModeration(fakeRequest({ action: "reject" }), { params: Promise.resolve({ id: "event3" }) });

    expect(emitDomainEventMock).not.toHaveBeenCalled();
  });

  it("уже был APPROVED ранее (повторный вызов) — НЕ дублирует уведомление", async () => {
    eventFindUnique.mockResolvedValue({ id: "event4", moderationStatus: "APPROVED", status: "PUBLISHED" });
    eventUpdate.mockResolvedValue({ id: "event4", status: "PUBLISHED" });

    await patchEventModeration(fakeRequest({ action: "approve" }), { params: Promise.resolve({ id: "event4" }) });

    expect(emitDomainEventMock).not.toHaveBeenCalled();
  });

  it("не-админ — 403, эмитить нечего", async () => {
    isAdminMock.mockReturnValue(false);

    const res = await patchEventModeration(fakeRequest({ action: "approve" }), { params: Promise.resolve({ id: "event5" }) });

    expect(res.status).toBe(403);
    expect(emitDomainEventMock).not.toHaveBeenCalled();
  });

  // QA BUG-010 regression — раньше несуществующий id падал сырым
  // PrismaClientKnownRequestError (P2025) прямо из tx.event.update.
  it("несуществующий id — понятная 404, транзакция не открывается", async () => {
    eventFindUnique.mockResolvedValue(null);

    const res = await patchEventModeration(fakeRequest({ action: "approve" }), { params: Promise.resolve({ id: "missing" }) });

    expect(res.status).toBe(404);
    expect(eventUpdate).not.toHaveBeenCalled();
    expect(emitDomainEventMock).not.toHaveBeenCalled();
  });
});

// Тесты SCHOOL_VERIFIED для approve заявки "Руководитель школы" —
// см. tests/access-requests/review.test.ts (источник переехал с
// PATCH /api/moderation/claims/[id] на reviewAccessRequest(), SchoolClaim
// удалена, docs/00_DECISIONS.md 2026-09-14).
