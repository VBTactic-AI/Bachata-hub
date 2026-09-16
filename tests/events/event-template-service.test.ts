import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Event, EventTemplate, User } from "@prisma/client";

const eventTemplateFindUnique = vi.fn();
const eventTemplateCreate = vi.fn();
const eventTemplateUpdate = vi.fn();
const eventTemplateFindMany = vi.fn();
const schoolFindUnique = vi.fn();
const eventFindUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    eventTemplate: {
      findUnique: (...a: unknown[]) => eventTemplateFindUnique(...a),
      create: (...a: unknown[]) => eventTemplateCreate(...a),
      update: (...a: unknown[]) => eventTemplateUpdate(...a),
      findMany: (...a: unknown[]) => eventTemplateFindMany(...a),
    },
    event: { findUnique: (...a: unknown[]) => eventFindUnique(...a) },
    school: { findUnique: (...a: unknown[]) => schoolFindUnique(...a) },
  },
}));

const {
  createEventTemplateFromEvent,
  updateEventTemplate,
  archiveEventTemplate,
  unarchiveEventTemplate,
  duplicateEventTemplate,
  getEventTemplate,
  EventTemplateForbiddenError,
  EventTemplateNotFoundError,
} = await import("@/server/events/event-template-service");

const owner = { id: "user_owner", role: "DANCER", isVerifiedEventOrganizer: true } as User;
const stranger = { id: "user_stranger", role: "DANCER", isVerifiedEventOrganizer: false } as User;
const admin = { id: "user_admin", role: "ADMIN" } as User;

function makeTemplate(overrides: Partial<EventTemplate> = {}): EventTemplate {
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
    ...overrides,
  } as EventTemplate;
}

function makeSourceEvent(overrides: Partial<Event> = {}): Event & { partyDetails: unknown } {
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
    ...overrides,
  } as unknown as Event & { partyDetails: unknown };
}

beforeEach(() => {
  vi.clearAllMocks();
  eventTemplateCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "tpl_1", ...data }));
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
});
