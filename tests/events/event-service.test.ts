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

// QA BUG-001 — logModeration() зовётся ПОСЛЕ $transaction, когда организатор
// снимает с публикации живое событие (см. event-service.ts).
const logModerationMock = vi.fn();
vi.mock("@/lib/moderation", () => ({ logModeration: (...a: unknown[]) => logModerationMock(...a) }));

const schoolFindUnique = vi.fn();
const eventFindUnique = vi.fn();
const eventUpdate = vi.fn();
const eventCreate = vi.fn();

const fakeTx = {
  event: { update: (...a: unknown[]) => eventUpdate(...a), create: (...a: unknown[]) => eventCreate(...a) },
  eventPriceOption: { deleteMany: vi.fn() },
  partyDetails: { deleteMany: vi.fn(), upsert: vi.fn() },
  masterclassDetails: { deleteMany: vi.fn() },
  // Events Engine, этап 6 — FestivalDetails/EventProgramItem чистятся при
  // каждом сохранении черновика (см. комментарий в event-service.ts),
  // независимо от формата, поэтому нужны в моке для ЛЮБОГО теста.
  festivalDetails: { deleteMany: vi.fn(), upsert: vi.fn().mockResolvedValue({ id: "festivalDetails1" }) },
  eventProgramItem: { deleteMany: vi.fn(), createMany: vi.fn() },
  // QA BUG-001 — подсчёт активных регистраций для audit-заметки при снятии
  // с публикации (см. isUnpublishing в event-service.ts).
  eventRegistration: { count: vi.fn().mockResolvedValue(0) },
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
  logModerationMock.mockReset();
  fakeTx.eventRegistration.count.mockReset().mockResolvedValue(0);
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
    eventFindUnique.mockResolvedValue({ id: "event6", createdById: "creator1", status: "PUBLISHED", moderationStatus: "APPROVED" });
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

  // QA BUG-003 regression — раньше проверялся только status, не
  // moderationStatus, поэтому отмена PENDING-события (status=PUBLISHED, но
  // модератор его ещё не одобрил, никто его не видел) всё равно слала
  // EVENT_CANCELLED.
  it("отменяет PUBLISHED, но ещё PENDING (никто не видел) — НЕ эмитит EVENT_CANCELLED", async () => {
    eventFindUnique.mockResolvedValue({ id: "event7b", createdById: "creator1", status: "PUBLISHED", moderationStatus: "PENDING" });
    eventUpdate.mockResolvedValue({ id: "event7b", status: "ARCHIVED" });

    await cancelEvent("event7b", user);

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

// Events Engine, этап 6 — FestivalDetails/EventProgramItem, тот же паттерн
// "полная замена на каждое сохранение", что и MasterclassSession.
describe("upsertEventDraft() — festival program (Events Engine, Stage 6)", () => {
  it("format=FESTIVAL с programItems — upsert FestivalDetails + createMany EventProgramItem, чистит party/masterclass", async () => {
    eventCreate.mockResolvedValue({
      id: "event12",
      slug: "fest-slug",
      title: "Grodno Latina Fest",
      cityId: "city1",
      format: "FESTIVAL",
      schoolId: null,
      startsAt: new Date(),
      updatedAt: new Date(),
    });

    await upsertEventDraft(
      baseInput({
        format: "FESTIVAL",
        festival: {
          programItems: [
            { title: "Открытие", type: "PARTY", startTime: "2026-10-17T18:00:00.000Z", endTime: undefined, teacherId: undefined },
            { title: "Bachata Sensual МК", type: "WORKSHOP", startTime: "2026-10-18T11:00:00.000Z", endTime: "2026-10-18T12:30:00.000Z", teacherId: "teacher1" },
          ],
        },
      }),
      user
    );

    expect(fakeTx.partyDetails.deleteMany).toHaveBeenCalledWith({ where: { eventId: "event12" } });
    expect(fakeTx.masterclassDetails.deleteMany).toHaveBeenCalledWith({ where: { eventId: "event12" } });
    expect(fakeTx.festivalDetails.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { eventId: "event12" } })
    );
    expect(fakeTx.eventProgramItem.deleteMany).toHaveBeenCalledWith({ where: { festivalDetailsId: "festivalDetails1" } });
    expect(fakeTx.eventProgramItem.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ festivalDetailsId: "festivalDetails1", title: "Открытие", type: "PARTY", order: 0 }),
        expect.objectContaining({ festivalDetailsId: "festivalDetails1", title: "Bachata Sensual МК", type: "WORKSHOP", teacherId: "teacher1", order: 1 }),
      ],
    });
  });

  it("format=PARTY чистит FestivalDetails (переключение формата не оставляет старую программу)", async () => {
    eventCreate.mockResolvedValue({
      id: "event13",
      slug: "s",
      title: "x",
      cityId: "city1",
      format: "PARTY",
      schoolId: null,
      startsAt: new Date(),
      updatedAt: new Date(),
    });

    await upsertEventDraft(baseInput({ format: "PARTY" }), user);

    expect(fakeTx.festivalDetails.deleteMany).toHaveBeenCalledWith({ where: { eventId: "event13" } });
    expect(fakeTx.festivalDetails.upsert).not.toHaveBeenCalledWith(expect.objectContaining({ where: { eventId: "event13" } }));
  });
});

// QA BUG-001 regression
describe("upsertEventDraft() — ARCHIVED неизменяемо (QA BUG-001)", () => {
  it("сохранение ARCHIVED события отклоняется — event_archived, update не вызывается", async () => {
    eventFindUnique.mockResolvedValue({ id: "eventArchived", createdById: "creator1", status: "ARCHIVED", moderationStatus: "APPROVED" });

    await expect(upsertEventDraft(baseInput(), user, "eventArchived")).rejects.toMatchObject({ code: "event_archived" });
    expect(eventUpdate).not.toHaveBeenCalled();
  });
});

// QA BUG-001 regression — снятие с публикации живого события не тихое
describe("upsertEventDraft() — unpublish живого события аудируется (QA BUG-001)", () => {
  it("PUBLISHED+APPROVED -> DRAFT — logModeration('unpublish') вызывается с числом активных регистраций", async () => {
    eventFindUnique.mockResolvedValue({
      id: "eventLive",
      createdById: "creator1",
      status: "PUBLISHED",
      moderationStatus: "APPROVED",
      startsAt: new Date("2026-09-01T00:00:00.000Z"),
      venueName: "Club X",
      venueAddress: null,
    });
    eventUpdate.mockResolvedValue({ id: "eventLive", slug: "s", title: "x", cityId: "city1", format: "PARTY", schoolId: null, updatedAt: new Date() });
    fakeTx.eventRegistration.count.mockResolvedValue(3);

    await upsertEventDraft(baseInput({ status: "DRAFT", startsAt: "2026-09-01T00:00:00.000Z", venueName: "Club X" }), user, "eventLive");

    expect(logModerationMock).toHaveBeenCalledWith(
      user,
      "EVENT",
      "eventLive",
      "unpublish",
      expect.stringContaining("3")
    );
  });

  it("DRAFT -> DRAFT (уже черновик) — не унопубликовывает повторно, logModeration не вызывается", async () => {
    eventFindUnique.mockResolvedValue({
      id: "eventDraft",
      createdById: "creator1",
      status: "DRAFT",
      moderationStatus: "PENDING",
      startsAt: new Date("2026-09-01T00:00:00.000Z"),
      venueName: "Club X",
      venueAddress: null,
    });
    eventUpdate.mockResolvedValue({ id: "eventDraft", slug: "s", title: "x", cityId: "city1", format: "PARTY", schoolId: null, updatedAt: new Date() });

    await upsertEventDraft(baseInput({ status: "DRAFT", startsAt: "2026-09-01T00:00:00.000Z", venueName: "Club X" }), user, "eventDraft");

    expect(logModerationMock).not.toHaveBeenCalled();
  });
});

// QA BUG-002 regression — самый критичный найденный баг: republish после
// явного REJECTED обходил решение модератора через auto-approve.
describe("upsertEventDraft() — republish после REJECTED требует нового review (QA BUG-002)", () => {
  it("REJECTED -> DRAFT -> PUBLISHED, верифицированный организатор — НЕ auto-approve, уходит в PENDING", async () => {
    shouldAutoApproveMock.mockReturnValue(true); // организатор верифицирован — обычно auto-approve
    eventFindUnique.mockResolvedValue({
      id: "eventRejected",
      createdById: "creator1",
      status: "DRAFT", // уже был пересохранён как DRAFT до этого вызова (BUG-001 exploit path)
      moderationStatus: "REJECTED",
      startsAt: new Date("2026-09-01T00:00:00.000Z"),
      venueName: "Club X",
      venueAddress: null,
    });
    eventUpdate.mockResolvedValue({ id: "eventRejected", slug: "s", title: "x", cityId: "city1", format: "PARTY", schoolId: null, updatedAt: new Date() });

    await upsertEventDraft(baseInput({ status: "PUBLISHED", startsAt: "2026-09-01T00:00:00.000Z", venueName: "Club X" }), user, "eventRejected");

    expect(eventUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ moderationStatus: "PENDING" }) })
    );
    expect(eventUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ moderationStatus: "APPROVED" }) })
    );
    expect(emitDomainEventMock).not.toHaveBeenCalledWith(fakeTx, expect.objectContaining({ type: "EVENT_PUBLISHED" }));
  });

  it("обычная первая публикация верифицированного организатора — auto-approve, moderatedById явно null (не наследует старое значение)", async () => {
    shouldAutoApproveMock.mockReturnValue(true);
    eventFindUnique.mockResolvedValue({
      id: "eventNew",
      createdById: "creator1",
      status: "DRAFT",
      moderationStatus: "PENDING",
      startsAt: new Date("2026-09-01T00:00:00.000Z"),
      venueName: "Club X",
      venueAddress: null,
    });
    eventUpdate.mockResolvedValue({ id: "eventNew", slug: "s", title: "x", cityId: "city1", format: "PARTY", schoolId: null, updatedAt: new Date() });

    await upsertEventDraft(baseInput({ status: "PUBLISHED", startsAt: "2026-09-01T00:00:00.000Z", venueName: "Club X" }), user, "eventNew");

    expect(eventUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ moderationStatus: "APPROVED", moderatedById: null }) })
    );
  });
});
