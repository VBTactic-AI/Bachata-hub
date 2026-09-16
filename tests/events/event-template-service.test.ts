import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Event, EventTemplate, EventTemplateTicketType, EventTemplatePass, TicketType, Pass, User } from "@prisma/client";

const eventTemplateFindUnique = vi.fn();
const eventTemplateCreate = vi.fn();
const eventTemplateUpdate = vi.fn();
const eventTemplateFindMany = vi.fn();
const schoolFindUnique = vi.fn();
const eventFindUnique = vi.fn();
const eventTemplateTicketTypeDeleteMany = vi.fn();
const eventTemplateTicketTypeCreateMany = vi.fn();
const eventTemplatePassDeleteMany = vi.fn();
const eventTemplatePassCreateMany = vi.fn();

const prismaMock = {
  eventTemplate: {
    findUnique: (...a: unknown[]) => eventTemplateFindUnique(...a),
    create: (...a: unknown[]) => eventTemplateCreate(...a),
    update: (...a: unknown[]) => eventTemplateUpdate(...a),
    findMany: (...a: unknown[]) => eventTemplateFindMany(...a),
  },
  eventTemplateTicketType: {
    deleteMany: (...a: unknown[]) => eventTemplateTicketTypeDeleteMany(...a),
    createMany: (...a: unknown[]) => eventTemplateTicketTypeCreateMany(...a),
  },
  eventTemplatePass: {
    deleteMany: (...a: unknown[]) => eventTemplatePassDeleteMany(...a),
    createMany: (...a: unknown[]) => eventTemplatePassCreateMany(...a),
  },
  event: { findUnique: (...a: unknown[]) => eventFindUnique(...a) },
  school: { findUnique: (...a: unknown[]) => schoolFindUnique(...a) },
  // updateEventTemplate оборачивает замену ticketTypes/passes в транзакцию —
  // мок просто прогоняет callback с тем же mock-объектом, чтобы вызовы
  // tx.eventTemplateTicketType/eventTemplatePass попадали в те же vi.fn().
  $transaction: (fn: (tx: unknown) => unknown) => fn(prismaMock),
};

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const {
  createEventTemplateFromEvent,
  updateEventTemplate,
  archiveEventTemplate,
  unarchiveEventTemplate,
  duplicateEventTemplate,
  getEventTemplate,
  EventTemplateForbiddenError,
  EventTemplateNotFoundError,
  EventTemplateValidationError,
} = await import("@/server/events/event-template-service");

const owner = { id: "user_owner", role: "DANCER", isVerifiedEventOrganizer: true } as User;
const stranger = { id: "user_stranger", role: "DANCER", isVerifiedEventOrganizer: false } as User;
const admin = { id: "user_admin", role: "ADMIN" } as User;

function makeTemplate(overrides: Partial<EventTemplate> & { ticketTypes?: EventTemplateTicketType[]; passes?: EventTemplatePass[] } = {}): EventTemplate & { ticketTypes: EventTemplateTicketType[]; passes: EventTemplatePass[] } {
  const { ticketTypes, passes, ...rest } = overrides;
  return {
    id: "tpl_1",
    createdById: owner.id,
    schoolId: null,
    name: "Bachata Friday Template",
    description: null,
    format: "PARTY",
    level: "ALL_LEVELS",
    cityId: null,
    venueName: null,
    venueAddress: null,
    defaultStartTime: "21:00",
    defaultEndTime: "02:00",
    ticketingMode: "UNSET",
    registrationEnabled: false,
    capacity: null,
    priceText: null,
    externalLinkUrl: null,
    tags: [],
    certainty: "CONFIRMED",
    photoUrl: null,
    typeDetails: null,
    status: "ACTIVE",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...rest,
    ticketTypes: ticketTypes ?? [],
    passes: passes ?? [],
  } as EventTemplate & { ticketTypes: EventTemplateTicketType[]; passes: EventTemplatePass[] };
}

function makeSourceEvent(
  overrides: Partial<Event> & { ticketTypes?: TicketType[]; passes?: Pass[] } = {}
): Event & { partyDetails: unknown; ticketTypes: TicketType[]; passes: Pass[] } {
  const { ticketTypes, passes, ...rest } = overrides;
  return {
    id: "evt_source",
    createdById: owner.id,
    title: "Bachata Friday",
    description: null,
    format: "PARTY",
    level: "ALL_LEVELS",
    schoolId: null,
    cityId: "city_1",
    venueName: "Dance Vision",
    venueAddress: null,
    startsAt: new Date("2026-09-19T18:00:00.000Z"), // 21:00 Europe/Minsk
    endsAt: new Date("2026-09-19T23:00:00.000Z"), // 02:00 след. дня Europe/Minsk
    ticketingMode: "UNSET",
    registrationEnabled: false,
    capacity: null,
    priceText: null,
    externalLinkUrl: null,
    tags: [],
    certainty: "CONFIRMED",
    photoUrl: null,
    partyDetails: null,
    ...rest,
    ticketTypes: ticketTypes ?? [],
    passes: passes ?? [],
  } as unknown as Event & { partyDetails: unknown; ticketTypes: TicketType[]; passes: Pass[] };
}

beforeEach(() => {
  vi.clearAllMocks();
  eventTemplateCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "tpl_1", ticketTypes: [], passes: [], ...data }));
});

describe("createEventTemplateFromEvent — RBAC/вывод HH:mm из startsAt/endsAt", () => {
  it("положительный: владелец события сохраняет его как шаблон", async () => {
    eventFindUnique.mockResolvedValue(makeSourceEvent());
    const result = await createEventTemplateFromEvent("evt_source", owner);
    expect(result.name).toBe("Bachata Friday");
  });

  it("название по умолчанию — заголовок события; можно переопределить", async () => {
    eventFindUnique.mockResolvedValue(makeSourceEvent());
    const result = await createEventTemplateFromEvent("evt_source", owner, "Кастомное имя");
    expect(result.name).toBe("Кастомное имя");
  });

  it("defaultStartTime/defaultEndTime выводятся из startsAt/endsAt (Europe/Minsk)", async () => {
    eventFindUnique.mockResolvedValue(makeSourceEvent());
    await createEventTemplateFromEvent("evt_source", owner);
    const created = eventTemplateCreate.mock.calls[0][0].data;
    expect(created.defaultStartTime).toBe("21:00");
    expect(created.defaultEndTime).toBe("02:00");
  });

  it("посторонний (не владелец события) — forbidden", async () => {
    eventFindUnique.mockResolvedValue(makeSourceEvent());
    await expect(createEventTemplateFromEvent("evt_source", stranger)).rejects.toThrow(EventTemplateForbiddenError);
    expect(eventTemplateCreate).not.toHaveBeenCalled();
  });

  it("ADMIN может сохранить чужое событие как шаблон", async () => {
    eventFindUnique.mockResolvedValue(makeSourceEvent());
    await expect(createEventTemplateFromEvent("evt_source", admin)).resolves.toBeTruthy();
  });

  it("несуществующее событие — not found", async () => {
    eventFindUnique.mockResolvedValue(null);
    await expect(createEventTemplateFromEvent("missing", owner)).rejects.toThrow(EventTemplateNotFoundError);
  });

  it("пустое переопределённое название отклоняется", async () => {
    eventFindUnique.mockResolvedValue(makeSourceEvent());
    await expect(createEventTemplateFromEvent("evt_source", owner, "   ")).rejects.toThrow();
  });

  it("тикеты и Pass события снимаются в шаблон (без дат/soldQuantity/status)", async () => {
    eventFindUnique.mockResolvedValue(
      makeSourceEvent({
        ticketTypes: [
          { id: "tt_1", eventId: "evt_source", name: "Early Bird", description: null, price: "25.00", currency: "BYN", quantity: 50, soldQuantity: 3, salesStartAt: null, salesEndAt: null, status: "ACTIVE", sortOrder: 0, isActive: true, createdAt: new Date(), updatedAt: new Date() } as unknown as TicketType,
        ],
        passes: [
          { id: "p_1", eventId: "evt_source", name: "Full Pass", description: null, type: "FULL_PASS", price: "120.00", currency: "BYN", quantity: null, soldQuantity: 1, salesStartAt: null, salesEndAt: null, validFrom: null, validUntil: null, status: "ACTIVE", sortOrder: 0, isActive: true, imageUrl: null, allowMultipleEntry: true, createdAt: new Date(), updatedAt: new Date() } as unknown as Pass,
        ],
      })
    );
    await createEventTemplateFromEvent("evt_source", owner);
    const data = eventTemplateCreate.mock.calls[0][0].data;
    expect(data.ticketTypes.create).toEqual([{ name: "Early Bird", description: null, price: "25.00", currency: "BYN", quantity: 50 }]);
    expect(data.passes.create).toEqual([
      { name: "Full Pass", description: null, type: "FULL_PASS", price: "120.00", currency: "BYN", quantity: null, imageUrl: null, allowMultipleEntry: true },
    ]);
  });
});

describe("updateEventTemplate / доступ", () => {
  it("владелец может редактировать", async () => {
    eventTemplateFindUnique.mockResolvedValue(makeTemplate());
    eventTemplateUpdate.mockResolvedValue(makeTemplate({ name: "New name" }));
    const result = await updateEventTemplate("tpl_1", owner, { name: "New name" });
    expect(result.name).toBe("New name");
  });

  it("ADMIN может редактировать чужой шаблон", async () => {
    eventTemplateFindUnique.mockResolvedValue(makeTemplate());
    eventTemplateUpdate.mockResolvedValue(makeTemplate({ name: "Admin edit" }));
    await expect(updateEventTemplate("tpl_1", admin, { name: "Admin edit" })).resolves.toBeTruthy();
  });

  it("посторонний пользователь получает forbidden", async () => {
    eventTemplateFindUnique.mockResolvedValue(makeTemplate());
    await expect(updateEventTemplate("tpl_1", stranger, { name: "Hack" })).rejects.toThrow(EventTemplateForbiddenError);
    expect(eventTemplateUpdate).not.toHaveBeenCalled();
  });

  it("несуществующий шаблон — not found", async () => {
    eventTemplateFindUnique.mockResolvedValue(null);
    await expect(getEventTemplate("missing", owner)).rejects.toThrow(EventTemplateNotFoundError);
  });

  it("архивный шаблон нельзя редактировать", async () => {
    eventTemplateFindUnique.mockResolvedValue(makeTemplate({ status: "ARCHIVED" }));
    await expect(updateEventTemplate("tpl_1", owner, { name: "X" })).rejects.toThrow(EventTemplateForbiddenError);
  });

  it("ticketTypes/passes в патче — полная замена (deleteMany + createMany)", async () => {
    eventTemplateFindUnique.mockResolvedValue(makeTemplate());
    eventTemplateUpdate.mockResolvedValue(makeTemplate());
    await updateEventTemplate("tpl_1", owner, {
      ticketTypes: [{ name: "Standard", price: 35 }],
      passes: [{ name: "Full Pass", type: "FULL_PASS" }],
    });
    expect(eventTemplateTicketTypeDeleteMany).toHaveBeenCalledWith({ where: { eventTemplateId: "tpl_1" } });
    expect(eventTemplateTicketTypeCreateMany).toHaveBeenCalledWith({
      data: [{ eventTemplateId: "tpl_1", name: "Standard", description: null, price: 35, currency: null, quantity: null }],
    });
    expect(eventTemplatePassDeleteMany).toHaveBeenCalledWith({ where: { eventTemplateId: "tpl_1" } });
    expect(eventTemplatePassCreateMany).toHaveBeenCalledWith({
      data: [{ eventTemplateId: "tpl_1", name: "Full Pass", description: null, type: "FULL_PASS", price: null, currency: null, quantity: null, imageUrl: null, allowMultipleEntry: true }],
    });
  });

  it("пустое название тикета в патче отклоняется", async () => {
    eventTemplateFindUnique.mockResolvedValue(makeTemplate());
    await expect(updateEventTemplate("tpl_1", owner, { ticketTypes: [{ name: "  " }] })).rejects.toThrow(EventTemplateValidationError);
    expect(eventTemplateTicketTypeDeleteMany).not.toHaveBeenCalled();
  });
});

describe("archive/unarchive — идемпотентность", () => {
  it("архивирование дважды — второй раз no-op, не ошибка", async () => {
    eventTemplateFindUnique.mockResolvedValue(makeTemplate({ status: "ARCHIVED" }));
    const result = await archiveEventTemplate("tpl_1", owner);
    expect(result.status).toBe("ARCHIVED");
    expect(eventTemplateUpdate).not.toHaveBeenCalled();
  });

  it("посторонний не может архивировать", async () => {
    eventTemplateFindUnique.mockResolvedValue(makeTemplate());
    await expect(archiveEventTemplate("tpl_1", stranger)).rejects.toThrow(EventTemplateForbiddenError);
  });

  it("unarchive возвращает в ACTIVE", async () => {
    eventTemplateFindUnique.mockResolvedValue(makeTemplate({ status: "ARCHIVED" }));
    eventTemplateUpdate.mockResolvedValue(makeTemplate({ status: "ACTIVE" }));
    const result = await unarchiveEventTemplate("tpl_1", owner);
    expect(result.status).toBe("ACTIVE");
  });
});

describe("duplicateEventTemplate", () => {
  it("копирует поля, создаёт новую запись за текущим пользователем", async () => {
    eventTemplateFindUnique.mockResolvedValue(makeTemplate());
    eventTemplateCreate.mockResolvedValue(makeTemplate({ id: "tpl_2", name: "Bachata Friday Template (копия)" }));
    const result = await duplicateEventTemplate("tpl_1", owner);
    expect(result.id).toBe("tpl_2");
    expect(eventTemplateCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ createdById: owner.id }) }));
  });

  it("копирует тикеты/Pass шаблона в дубликат", async () => {
    eventTemplateFindUnique.mockResolvedValue(
      makeTemplate({
        ticketTypes: [{ id: "tt_1", eventTemplateId: "tpl_1", name: "Standard", description: null, price: null, currency: null, quantity: null, createdAt: new Date(), updatedAt: new Date() }],
        passes: [],
      })
    );
    eventTemplateCreate.mockResolvedValue(makeTemplate({ id: "tpl_2" }));
    await duplicateEventTemplate("tpl_1", owner);
    const data = eventTemplateCreate.mock.calls[0][0].data;
    expect(data.ticketTypes.create).toEqual([{ name: "Standard", description: null, price: null, currency: null, quantity: null }]);
  });
});
