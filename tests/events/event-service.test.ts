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
// Наследование тикетов/Pass шаблоном (см. комментарий у upsertEventDraft,
// event-service.ts) — задействуются только когда input.templateId задан.
const eventTemplateFindUnique = vi.fn().mockResolvedValue(null);
// Commerce Engine v1 (2026-09-18) — по одному через create(), не createMany()
// (см. комментарий у upsertEventDraft, event-service.ts): каждый
// скопированный TicketType/Pass должен сразу получить свой Product.
const ticketTypeCreate = vi.fn();
const passCreate = vi.fn();
const templateProductCreate = vi.fn();

const fakeTx = {
  event: { update: (...a: unknown[]) => eventUpdate(...a), create: (...a: unknown[]) => eventCreate(...a) },
  eventPriceOption: { deleteMany: vi.fn() },
  partyDetails: { deleteMany: vi.fn(), upsert: vi.fn() },
  masterclassDetails: { deleteMany: vi.fn() },
  // QA BUG-001 — подсчёт активных регистраций для audit-заметки при снятии
  // с публикации (см. isUnpublishing в event-service.ts).
  eventRegistration: { count: vi.fn().mockResolvedValue(0) },
  eventTemplate: { findUnique: (...a: unknown[]) => eventTemplateFindUnique(...a) },
  ticketType: { create: (...a: unknown[]) => ticketTypeCreate(...a) },
  pass: { create: (...a: unknown[]) => passCreate(...a) },
  product: { create: (...a: unknown[]) => templateProductCreate(...a) },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    school: { findUnique: (...a: unknown[]) => schoolFindUnique(...a) },
    event: { findUnique: (...a: unknown[]) => eventFindUnique(...a) },
    $transaction: (fn: (tx: typeof fakeTx) => unknown) => fn(fakeTx),
  },
}));

const { upsertEventDraft, cancelEvent, publishEvent, EventForbiddenError } = await import("@/server/events/event-service");

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
  eventTemplateFindUnique.mockReset().mockResolvedValue(null);
  ticketTypeCreate.mockReset();
  passCreate.mockReset();
  templateProductCreate.mockReset();
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

// Наследование тикетов/Pass шаблоном (2026-09-16, по прямому запросу
// пользователя) — templateId копируется в TicketType/Pass РОВНО ОДИН РАЗ,
// только при создании нового события (см. комментарий в event-service.ts).
describe("upsertEventDraft() — наследование тикетов/Pass из EventTemplate.templateId", () => {
  it("создание с templateId — копирует ticketTypes/passes шаблона на новое событие, каждый с собственным Product", async () => {
    eventCreate.mockResolvedValue({ id: "event1", slug: "party-slug", title: "Bachata Night", cityId: "city1", format: "PARTY", schoolId: null, updatedAt: new Date() });
    eventTemplateFindUnique.mockResolvedValue({
      id: "tpl_1",
      createdById: "creator1",
      ticketTypes: [{ name: "Early Bird", description: null, price: "25.00", currency: "BYN", quantity: 50 }],
      passes: [{ name: "Full Pass", description: null, type: "FULL_PASS", price: "120.00", currency: "BYN", quantity: null, imageUrl: null, allowMultipleEntry: true }],
    });
    ticketTypeCreate.mockResolvedValue({ id: "tt1" });
    passCreate.mockResolvedValue({ id: "pass1" });

    await upsertEventDraft(baseInput({ templateId: "tpl_1" }), user);

    expect(eventTemplateFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "tpl_1" } })
    );
    expect(ticketTypeCreate).toHaveBeenCalledWith({
      data: { eventId: "event1", name: "Early Bird", description: null, price: "25.00", currency: "BYN", quantity: 50 },
    });
    expect(passCreate).toHaveBeenCalledWith({
      data: { eventId: "event1", name: "Full Pass", description: null, type: "FULL_PASS", price: "120.00", currency: "BYN", quantity: null, imageUrl: null, allowMultipleEntry: true },
    });
    // Commerce Engine v1 — без Product билет по такому Pass/TicketType
    // вообще нельзя было бы выдать (issueTicket() упал бы с "рассинхронизация
    // Commerce Engine").
    expect(templateProductCreate).toHaveBeenCalledWith({ data: { eventId: "event1", type: "EVENT_TICKET", ticketTypeId: "tt1" } });
    expect(templateProductCreate).toHaveBeenCalledWith({ data: { eventId: "event1", type: "PASS", passId: "pass1" } });
  });

  it("templateId, принадлежащий чужому пользователю — тихо игнорируется, тикеты не копируются", async () => {
    eventCreate.mockResolvedValue({ id: "event1", slug: "party-slug", title: "Bachata Night", cityId: "city1", format: "PARTY", schoolId: null, updatedAt: new Date() });
    eventTemplateFindUnique.mockResolvedValue({
      id: "tpl_1",
      createdById: "someone_else",
      ticketTypes: [{ name: "Early Bird", description: null, price: null, currency: null, quantity: null }],
      passes: [],
    });

    await upsertEventDraft(baseInput({ templateId: "tpl_1" }), user);

    expect(ticketTypeCreate).not.toHaveBeenCalled();
  });

  it("редактирование существующего события — templateId в input игнорируется (не переприменяется задним числом)", async () => {
    eventFindUnique.mockResolvedValue({
      id: "eventExisting",
      createdById: "creator1",
      status: "DRAFT",
      moderationStatus: "PENDING",
      startsAt: new Date("2026-09-01T00:00:00.000Z"),
      venueName: "Club X",
      venueAddress: null,
    });
    eventUpdate.mockResolvedValue({ id: "eventExisting", slug: "s", title: "x", cityId: "city1", format: "PARTY", schoolId: null, updatedAt: new Date() });

    await upsertEventDraft(baseInput({ status: "DRAFT", templateId: "tpl_1", startsAt: "2026-09-01T00:00:00.000Z", venueName: "Club X" }), user, "eventExisting");

    expect(eventTemplateFindUnique).not.toHaveBeenCalled();
  });
});

// "Опубликовать" из таблички "Мои события" (2026-09-16, по прямому запросу
// пользователя) — publishEvent() собирает EventDraftInput из уже
// сохранённого события и делегирует upsertEventDraft(), так что чеклист/
// модерация/уведомления — та же логика, что и обычная публикация из мастера
// (см. комментарий у функции, event-service.ts).
describe("publishEvent() — быстрая публикация из списка «Мои события»", () => {
  function makeDraftEventRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "eventDraft1",
      createdById: "creator1",
      status: "DRAFT",
      moderationStatus: "PENDING",
      format: "PARTY",
      certainty: "CONFIRMED",
      title: "Bachata Night",
      description: null,
      level: "ALL_LEVELS",
      cityId: "city1",
      schoolId: null,
      organizerName: null,
      venueName: "Club X",
      venueAddress: null,
      startsAt: new Date("2026-09-20T18:00:00.000Z"),
      endsAt: null,
      capacity: null,
      registrationEnabled: false,
      ticketingMode: "UNSET",
      priceText: null,
      externalLinkUrl: null,
      tags: [],
      priceOptions: [],
      partyDetails: null,
      masterclassDetails: null,
      ...overrides,
    };
  }

  it("уже опубликованное событие — идемпотентно, upsertEventDraft не вызывается", async () => {
    eventFindUnique.mockResolvedValue(makeDraftEventRow({ status: "PUBLISHED" }));
    const result = await publishEvent("eventDraft1", user);
    expect(result.status).toBe("PUBLISHED");
    expect(eventUpdate).not.toHaveBeenCalled();
  });

  it("черновик со всеми обязательными полями — публикуется через ту же логику upsertEventDraft (эмитит EVENT_PUBLISHED)", async () => {
    eventFindUnique.mockResolvedValue(makeDraftEventRow());
    eventUpdate.mockResolvedValue({
      id: "eventDraft1",
      slug: "party-slug",
      title: "Bachata Night",
      cityId: "city1",
      format: "PARTY",
      schoolId: null,
      startsAt: new Date("2026-09-20T18:00:00.000Z"),
      updatedAt: new Date(),
    });

    await publishEvent("eventDraft1", user);

    expect(eventUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "eventDraft1" }, data: expect.objectContaining({ status: "PUBLISHED", title: "Bachata Night" }) })
    );
    expect(emitDomainEventMock).toHaveBeenCalledWith(fakeTx, expect.objectContaining({ type: "EVENT_PUBLISHED" }));
  });

  it("посторонний пользователь — forbidden", async () => {
    eventFindUnique.mockResolvedValue(makeDraftEventRow());
    await expect(publishEvent("eventDraft1", makeUser({ id: "someone_else" }))).rejects.toThrow(EventForbiddenError);
  });
});
