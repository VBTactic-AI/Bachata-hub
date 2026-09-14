import { describe, it, expect, vi, beforeEach } from "vitest";
import type { User } from "@prisma/client";
import type { EventDraftInput } from "@/server/events/schemas";

vi.mock("@/lib/slug", () => ({ uniqueSlug: vi.fn().mockResolvedValue("party-slug") }));
vi.mock("@/lib/auth", () => ({ canCreateEvents: vi.fn().mockReturnValue(true) }));

const shouldAutoApproveMock = vi.fn();
vi.mock("@/lib/events/moderation", () => ({ shouldAutoApproveEvent: (...a: unknown[]) => shouldAutoApproveMock(...a) }));

vi.mock("@/lib/events/event-type-registry", () => ({
  computePublishChecklist: vi.fn().mockReturnValue([]),
  isChecklistComplete: vi.fn().mockReturnValue(true),
}));

vi.mock("@/server/competition/create-competition", () => ({ createCompetition: vi.fn() }));
vi.mock("@/server/rbac/authorize", () => ({ can: vi.fn().mockReturnValue(true) }));
vi.mock("@/server/rbac/actor", () => ({ getActor: vi.fn().mockResolvedValue({}) }));

const emitDomainEventMock = vi.fn();
vi.mock("@/server/notifications/emit-domain-event", () => ({
  emitDomainEvent: (...a: unknown[]) => emitDomainEventMock(...a),
}));

const schoolFindUnique = vi.fn();
const eventFindUnique = vi.fn();
const eventUpdate = vi.fn();
const eventCreate = vi.fn();

const fakeTx = {
  event: { update: (...a: unknown[]) => eventUpdate(...a), create: (...a: unknown[]) => eventCreate(...a) },
  eventPriceOption: { deleteMany: vi.fn() },
  partyDetails: { deleteMany: vi.fn(), upsert: vi.fn() },
  masterclassDetails: { deleteMany: vi.fn() },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    school: { findUnique: (...a: unknown[]) => schoolFindUnique(...a) },
    event: { findUnique: (...a: unknown[]) => eventFindUnique(...a) },
    $transaction: (fn: (tx: typeof fakeTx) => unknown) => fn(fakeTx),
  },
}));

const { upsertEventDraft, cancelEvent, EventForbiddenError } = await import("@/server/events/event-service");

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "creator1",
    email: "u@example.com",
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
  };
}

function baseInput(overrides: Partial<EventDraftInput> = {}): EventDraftInput {
  return {
    status: "PUBLISHED",
    format: "PARTY",
    level: "ALL_LEVELS",
    title: "Bachata Night",
    cityId: "city1",
    venueName: "Club X",
    startsAt: "2026-09-20T18:00:00.000Z",
    ...overrides,
  } as EventDraftInput;
}

const user = makeUser();

beforeEach(() => {
  schoolFindUnique.mockReset();
  eventFindUnique.mockReset().mockResolvedValue(null);
  eventUpdate.mockReset();
  eventCreate.mockReset();
  emitDomainEventMock.mockReset();
  shouldAutoApproveMock.mockReset().mockReturnValue(true);
});

describe("upsertEventDraft() — EVENT_PUBLISHED (Notification & Subscription Engine, Phase 6)", () => {
  it("новое событие сразу PUBLISHED + autoApprove — эмитит EVENT_PUBLISHED", async () => {
    eventCreate.mockResolvedValue({
      id: "event1",
      slug: "party-slug",
      title: "Bachata Night",
      cityId: "city1",
      format: "PARTY",
      schoolId: null,
      startsAt: new Date("2026-09-20T18:00:00.000Z"),
      updatedAt: new Date(),
    });

    await upsertEventDraft(baseInput(), user);

    expect(emitDomainEventMock).toHaveBeenCalledWith(
      fakeTx,
      expect.objectContaining({
        type: "EVENT_PUBLISHED",
        payload: expect.objectContaining({ entityId: "event1", eventSlug: "party-slug", cityId: "city1", format: "PARTY" }),
        idempotencyKey: "EVENT_PUBLISHED:event1",
      })
    );
  });

  it("новое событие PUBLISHED, но autoApprove=false (ждёт модерации) — НЕ эмитит (не видно никому ещё)", async () => {
    shouldAutoApproveMock.mockReturnValue(false);
    eventCreate.mockResolvedValue({
      id: "event2",
      slug: "party-slug",
      title: "x",
      cityId: "city1",
      format: "PARTY",
      schoolId: null,
      startsAt: new Date(),
      updatedAt: new Date(),
    });

    await upsertEventDraft(baseInput(), user);

    expect(emitDomainEventMock).not.toHaveBeenCalled();
  });

  it("новый ЧЕРНОВИК (status=DRAFT) — НЕ эмитит вообще (ТЗ: DRAFT не рассылает публичное уведомление)", async () => {
    eventCreate.mockResolvedValue({ id: "event3", slug: "s", title: "x", cityId: "city1", format: "PARTY", schoolId: null, startsAt: new Date(), updatedAt: new Date() });

    await upsertEventDraft(baseInput({ status: "DRAFT" }), user);

    expect(emitDomainEventMock).not.toHaveBeenCalled();
  });

  it("DRAFT -> PUBLISHED (существующий черновик) + autoApprove — эмитит EVENT_PUBLISHED", async () => {
    eventFindUnique.mockResolvedValue({
      id: "event4",
      createdById: "creator1",
      status: "DRAFT",
      moderationStatus: "PENDING",
      startsAt: new Date("2026-09-01T00:00:00.000Z"),
      venueName: "Old venue",
      venueAddress: null,
    });
    eventUpdate.mockResolvedValue({
      id: "event4",
      slug: "party-slug",
      title: "Bachata Night",
      cityId: "city1",
      format: "PARTY",
      schoolId: null,
      startsAt: new Date("2026-09-20T18:00:00.000Z"),
      updatedAt: new Date(),
    });

    await upsertEventDraft(baseInput(), user, "event4");

    expect(emitDomainEventMock).toHaveBeenCalledWith(
      fakeTx,
      expect.objectContaining({ type: "EVENT_PUBLISHED", idempotencyKey: "EVENT_PUBLISHED:event4" })
    );
  });
});

describe("upsertEventDraft() — EVENT_UPDATED (только значимые поля УЖЕ живого события)", () => {
  function liveExisting(overrides: Record<string, unknown> = {}) {
    return {
      id: "event5",
      createdById: "creator1",
      status: "PUBLISHED",
      moderationStatus: "APPROVED",
      startsAt: new Date("2026-09-01T00:00:00.000Z"),
      venueName: "Old venue",
      venueAddress: "Old address",
      ...overrides,
    };
  }

  it("изменилось время (startsAt) — эмитит EVENT_UPDATED с changedFields=['startsAt']", async () => {
    eventFindUnique.mockResolvedValue(liveExisting());
    eventUpdate.mockResolvedValue({
      id: "event5",
      slug: "s",
      title: "Bachata Night",
      cityId: "city1",
      format: "PARTY",
      schoolId: null,
      updatedAt: new Date("2026-09-05T00:00:00.000Z"),
    });

    await upsertEventDraft(baseInput({ venueName: "Old venue", venueAddress: "Old address" }), user, "event5");

    expect(emitDomainEventMock).toHaveBeenCalledWith(
      fakeTx,
      expect.objectContaining({
        type: "EVENT_UPDATED",
        payload: expect.objectContaining({ changedFields: ["startsAt"] }),
        idempotencyKey: "EVENT_UPDATED:event5:2026-09-05T00:00:00.000Z",
      })
    );
  });

  it("не изменилось ни время, ни место (только описание) — НЕ эмитит", async () => {
    eventFindUnique.mockResolvedValue(liveExisting());
    eventUpdate.mockResolvedValue({ id: "event5", slug: "s", title: "x", cityId: "city1", format: "PARTY", schoolId: null, updatedAt: new Date() });

    await upsertEventDraft(
      baseInput({ startsAt: "2026-09-01T00:00:00.000Z", venueName: "Old venue", venueAddress: "Old address", description: "новый текст" }),
      user,
      "event5"
    );

    expect(emitDomainEventMock).not.toHaveBeenCalled();
  });

  it("событие ещё НЕ прошло модерацию (moderationStatus=PENDING) — НЕ эмитит EVENT_UPDATED, хотя status=PUBLISHED", async () => {
    eventFindUnique.mockResolvedValue(liveExisting({ moderationStatus: "PENDING" }));
    eventUpdate.mockResolvedValue({ id: "event5", slug: "s", title: "x", cityId: "city1", format: "PARTY", schoolId: null, updatedAt: new Date() });

    await upsertEventDraft(baseInput({ venueName: "New venue", venueAddress: "Old address" }), user, "event5");

    expect(emitDomainEventMock).not.toHaveBeenCalled();
  });
});

describe("cancelEvent() — EVENT_CANCELLED (Phase 6, минимальная отмена)", () => {
  it("отменяет опубликованное событие — status=ARCHIVED, эмитит EVENT_CANCELLED", async () => {
    eventFindUnique.mockResolvedValue({ id: "event6", createdById: "creator1", status: "PUBLISHED" });
    eventUpdate.mockResolvedValue({ id: "event6", slug: "s", title: "x", cityId: "city1", format: "PARTY", schoolId: null, status: "ARCHIVED" });

    await cancelEvent("event6", user);

    expect(eventUpdate).toHaveBeenCalledWith({ where: { id: "event6" }, data: { status: "ARCHIVED" } });
    expect(emitDomainEventMock).toHaveBeenCalledWith(
      fakeTx,
      expect.objectContaining({ type: "EVENT_CANCELLED", idempotencyKey: "EVENT_CANCELLED:event6" })
    );
  });

  it("отменяет ЧЕРНОВИК (никогда не был виден) — status=ARCHIVED, но НЕ эмитит", async () => {
    eventFindUnique.mockResolvedValue({ id: "event7", createdById: "creator1", status: "DRAFT" });
    eventUpdate.mockResolvedValue({ id: "event7", status: "ARCHIVED" });

    await cancelEvent("event7", user);

    expect(emitDomainEventMock).not.toHaveBeenCalled();
  });

  it("уже отменённое событие — идемпотентно, update/emit не вызываются повторно", async () => {
    eventFindUnique.mockResolvedValue({ id: "event8", createdById: "creator1", status: "ARCHIVED" });

    const result = await cancelEvent("event8", user);

    expect(result).toEqual({ id: "event8", createdById: "creator1", status: "ARCHIVED" });
    expect(eventUpdate).not.toHaveBeenCalled();
    expect(emitDomainEventMock).not.toHaveBeenCalled();
  });

  it("чужое событие, не ADMIN — EventForbiddenError, update/emit не вызываются", async () => {
    eventFindUnique.mockResolvedValue({ id: "event9", createdById: "someone-else", status: "PUBLISHED" });

    await expect(cancelEvent("event9", user)).rejects.toBeInstanceOf(EventForbiddenError);
    expect(eventUpdate).not.toHaveBeenCalled();
    expect(emitDomainEventMock).not.toHaveBeenCalled();
  });
});

// Events Engine, Stage 1 — certainty (TENTATIVE/CONFIRMED) сохраняется как
// обычное поле черновика, независимо от status/moderationStatus (не
// смешивается с логикой EVENT_PUBLISHED/EVENT_UPDATED выше).
describe("upsertEventDraft() — certainty (Events Engine, Stage 1)", () => {
  it("новое событие с certainty=TENTATIVE — передаёт его в tx.event.create", async () => {
    eventCreate.mockResolvedValue({
      id: "event10",
      slug: "party-slug",
      title: "Bachata Night",
      cityId: "city1",
      format: "PARTY",
      schoolId: null,
      startsAt: new Date(),
      updatedAt: new Date(),
    });

    await upsertEventDraft(baseInput({ certainty: "TENTATIVE" }), user);

    expect(eventCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ certainty: "TENTATIVE" }) })
    );
  });

  it("обновление существующего события с certainty=CONFIRMED — передаёт его в tx.event.update", async () => {
    eventFindUnique.mockResolvedValue({
      id: "event11",
      createdById: "creator1",
      status: "PUBLISHED",
      moderationStatus: "APPROVED",
      startsAt: new Date("2026-09-01T00:00:00.000Z"),
      venueName: "Club X",
      venueAddress: null,
    });
    eventUpdate.mockResolvedValue({
      id: "event11",
      slug: "s",
      title: "x",
      cityId: "city1",
      format: "PARTY",
      schoolId: null,
      updatedAt: new Date(),
    });

    await upsertEventDraft(
      baseInput({ certainty: "CONFIRMED", startsAt: "2026-09-01T00:00:00.000Z", venueName: "Club X" }),
      user,
      "event11"
    );

    expect(eventUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ certainty: "CONFIRMED" }) })
    );
  });
});
