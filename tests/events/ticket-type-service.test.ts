import { describe, it, expect, vi, beforeEach } from "vitest";
import type { User } from "@prisma/client";

// Ticket Engine v2 (2026-09-16) — TicketType CRUD. Простой билет на ОДНО
// событие, НЕ Pass (см. комментарий у моделей в schema.prisma). Те же
// правила доступа, что и у pass-service.ts: create/update/status/delete —
// isOwnerOrAdmin, чтение списка — hasEventAccess (eventTeamMember тоже
// замокан по этой причине).

const eventFindUnique = vi.fn();
const ticketTypeFindUnique = vi.fn();
const ticketTypeFindMany = vi.fn();
const ticketTypeCreate = vi.fn();
const ticketTypeUpdate = vi.fn();
const ticketTypeDelete = vi.fn();
const ticketCount = vi.fn();
const eventTeamMemberFindUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    event: { findUnique: (...a: unknown[]) => eventFindUnique(...a) },
    ticketType: {
      findUnique: (...a: unknown[]) => ticketTypeFindUnique(...a),
      findMany: (...a: unknown[]) => ticketTypeFindMany(...a),
      create: (...a: unknown[]) => ticketTypeCreate(...a),
      update: (...a: unknown[]) => ticketTypeUpdate(...a),
      delete: (...a: unknown[]) => ticketTypeDelete(...a),
    },
    ticket: { count: (...a: unknown[]) => ticketCount(...a) },
    eventTeamMember: { findUnique: (...a: unknown[]) => eventTeamMemberFindUnique(...a) },
  },
}));

const {
  createTicketType,
  updateTicketType,
  setTicketTypeStatus,
  archiveTicketType,
  deleteTicketType,
  syncTicketTypeLifecycle,
  listTicketTypesForEvent,
  getTicketType,
  TicketTypeValidationError,
} = await import("@/server/events/ticket-type-service");
const { RegistrationForbiddenError, RegistrationNotFoundError } = await import("@/server/events/registration-service");

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "owner1",
    email: "owner@example.com",
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

const event = { id: "event1", createdById: "owner1" };
const owner = makeUser();
const baseTicketType = {
  id: "tt1",
  eventId: "event1",
  name: "Dancer",
  description: null,
  price: null,
  currency: null,
  quantity: null as number | null,
  soldQuantity: 0,
  salesStartAt: null as Date | null,
  salesEndAt: null as Date | null,
  status: "DRAFT" as const,
  sortOrder: 0,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  eventFindUnique.mockReset().mockResolvedValue(event);
  ticketTypeFindUnique.mockReset().mockResolvedValue({ ...baseTicketType, event });
  ticketTypeFindMany.mockReset().mockResolvedValue([]);
  ticketTypeCreate.mockReset().mockImplementation((args) => Promise.resolve({ ...baseTicketType, ...args.data }));
  ticketTypeUpdate.mockReset().mockImplementation((args) => Promise.resolve({ ...baseTicketType, ...args.data }));
  ticketTypeDelete.mockReset().mockResolvedValue({});
  ticketCount.mockReset().mockResolvedValue(0);
  eventTeamMemberFindUnique.mockReset().mockResolvedValue(null);
});

describe("createTicketType()", () => {
  it("чужое событие, не ADMIN — RegistrationForbiddenError, create не вызывается", async () => {
    eventFindUnique.mockResolvedValue({ id: "event1", createdById: "someone-else" });
    await expect(createTicketType("event1", owner, { name: "Dancer" })).rejects.toBeInstanceOf(RegistrationForbiddenError);
    expect(ticketTypeCreate).not.toHaveBeenCalled();
  });

  it("событие не найдено — RegistrationNotFoundError", async () => {
    eventFindUnique.mockResolvedValue(null);
    await expect(createTicketType("missing", owner, { name: "Dancer" })).rejects.toBeInstanceOf(RegistrationNotFoundError);
  });

  it("пустое имя — TicketTypeValidationError", async () => {
    await expect(createTicketType("event1", owner, { name: "   " })).rejects.toBeInstanceOf(TicketTypeValidationError);
    expect(ticketTypeCreate).not.toHaveBeenCalled();
  });

  it("отрицательная цена — TicketTypeValidationError", async () => {
    await expect(createTicketType("event1", owner, { name: "VIP", price: -10 })).rejects.toBeInstanceOf(TicketTypeValidationError);
  });

  it("нулевое/дробное quantity — TicketTypeValidationError", async () => {
    await expect(createTicketType("event1", owner, { name: "VIP", quantity: 0 })).rejects.toBeInstanceOf(TicketTypeValidationError);
    await expect(createTicketType("event1", owner, { name: "VIP", quantity: 1.5 })).rejects.toBeInstanceOf(TicketTypeValidationError);
  });

  it("salesStartAt позже salesEndAt — TicketTypeValidationError", async () => {
    await expect(
      createTicketType("event1", owner, { name: "VIP", salesStartAt: new Date("2026-06-02"), salesEndAt: new Date("2026-06-01") })
    ).rejects.toBeInstanceOf(TicketTypeValidationError);
  });

  it("владелец — создаёт с триммированным именем и sortOrder по умолчанию 0", async () => {
    await createTicketType("event1", owner, { name: "  Dancer  ", price: 15, currency: "BYN", quantity: 50 });
    expect(ticketTypeCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ eventId: "event1", name: "Dancer", price: 15, currency: "BYN", quantity: 50, sortOrder: 0 }),
    });
  });
});

describe("updateTicketType()", () => {
  it("нельзя опустить quantity ниже уже проданного количества", async () => {
    ticketTypeFindUnique.mockResolvedValue({ ...baseTicketType, quantity: 50, soldQuantity: 30, event });
    await expect(updateTicketType("tt1", owner, { quantity: 10 })).rejects.toBeInstanceOf(TicketTypeValidationError);
    expect(ticketTypeUpdate).not.toHaveBeenCalled();
  });

  it("quantity равно soldQuantity — разрешено", async () => {
    ticketTypeFindUnique.mockResolvedValue({ ...baseTicketType, quantity: 50, soldQuantity: 30, event });
    await updateTicketType("tt1", owner, { quantity: 30 });
    expect(ticketTypeUpdate).toHaveBeenCalledWith({ where: { id: "tt1" }, data: expect.objectContaining({ quantity: 30 }) });
  });

  it("чужой TicketType — RegistrationForbiddenError", async () => {
    ticketTypeFindUnique.mockResolvedValue({ ...baseTicketType, event: { id: "event1", createdById: "someone-else" } });
    await expect(updateTicketType("tt1", owner, { name: "New" })).rejects.toBeInstanceOf(RegistrationForbiddenError);
  });

  it("TicketType не найден — RegistrationNotFoundError", async () => {
    ticketTypeFindUnique.mockResolvedValue(null);
    await expect(updateTicketType("missing", owner, { name: "New" })).rejects.toBeInstanceOf(RegistrationNotFoundError);
  });
});

describe("setTicketTypeStatus()", () => {
  it("DRAFT/ACTIVE/PAUSED/ARCHIVED — разрешены", async () => {
    for (const status of ["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"] as const) {
      await setTicketTypeStatus("tt1", owner, status);
      expect(ticketTypeUpdate).toHaveBeenCalledWith({ where: { id: "tt1" }, data: { status } });
    }
  });

  it("SOLD_OUT/ENDED — TicketTypeValidationError, нельзя назначить вручную", async () => {
    await expect(setTicketTypeStatus("tt1", owner, "SOLD_OUT")).rejects.toBeInstanceOf(TicketTypeValidationError);
    await expect(setTicketTypeStatus("tt1", owner, "ENDED")).rejects.toBeInstanceOf(TicketTypeValidationError);
    expect(ticketTypeUpdate).not.toHaveBeenCalled();
  });

  it("archiveTicketType() — эквивалент setTicketTypeStatus(ARCHIVED)", async () => {
    await archiveTicketType("tt1", owner);
    expect(ticketTypeUpdate).toHaveBeenCalledWith({ where: { id: "tt1" }, data: { status: "ARCHIVED" } });
  });
});

describe("deleteTicketType() — настоящее удаление", () => {
  it("ни одного Ticket не выдавалось — удаляет физически", async () => {
    ticketTypeFindUnique.mockResolvedValue({ ...baseTicketType, event });
    ticketCount.mockResolvedValue(0);
    await deleteTicketType("tt1", owner);
    expect(ticketCount).toHaveBeenCalledWith({ where: { ticketTypeId: "tt1" } });
    expect(ticketTypeDelete).toHaveBeenCalledWith({ where: { id: "tt1" } });
  });

  it("есть выданные билеты — TicketTypeValidationError('ticket_type_has_sales'), delete не вызывается", async () => {
    ticketTypeFindUnique.mockResolvedValue({ ...baseTicketType, event });
    ticketCount.mockResolvedValue(2);
    await expect(deleteTicketType("tt1", owner)).rejects.toMatchObject({ code: "ticket_type_has_sales" });
    expect(ticketTypeDelete).not.toHaveBeenCalled();
  });

  it("чужой TicketType — RegistrationForbiddenError", async () => {
    ticketTypeFindUnique.mockResolvedValue({ ...baseTicketType, event: { id: "event1", createdById: "someone-else" } });
    await expect(deleteTicketType("tt1", owner)).rejects.toBeInstanceOf(RegistrationForbiddenError);
  });
});

describe("syncTicketTypeLifecycle()", () => {
  it("ACTIVE + soldQuantity >= quantity — переключает в SOLD_OUT", async () => {
    const tt = { ...baseTicketType, status: "ACTIVE" as const, quantity: 10, soldQuantity: 10 };
    ticketTypeUpdate.mockResolvedValue({ ...tt, status: "SOLD_OUT" });
    const result = await syncTicketTypeLifecycle(tt);
    expect(ticketTypeUpdate).toHaveBeenCalledWith({ where: { id: "tt1" }, data: { status: "SOLD_OUT" } });
    expect(result.status).toBe("SOLD_OUT");
  });

  it("ACTIVE + salesEndAt в прошлом — переключает в ENDED", async () => {
    const tt = { ...baseTicketType, status: "ACTIVE" as const, salesEndAt: new Date(Date.now() - 1000) };
    ticketTypeUpdate.mockResolvedValue({ ...tt, status: "ENDED" });
    const result = await syncTicketTypeLifecycle(tt);
    expect(result.status).toBe("ENDED");
  });

  it("SOLD_OUT + место освободилось — переключает обратно в ACTIVE", async () => {
    const tt = { ...baseTicketType, status: "SOLD_OUT" as const, quantity: 10, soldQuantity: 9 };
    ticketTypeUpdate.mockResolvedValue({ ...tt, status: "ACTIVE" });
    const result = await syncTicketTypeLifecycle(tt);
    expect(result.status).toBe("ACTIVE");
  });

  it("PAUSED/DRAFT/ARCHIVED — не трогаются автоматически", async () => {
    await syncTicketTypeLifecycle({ ...baseTicketType, status: "PAUSED" as const, quantity: 1, soldQuantity: 1 });
    await syncTicketTypeLifecycle({ ...baseTicketType, status: "DRAFT" as const, quantity: 1, soldQuantity: 1 });
    await syncTicketTypeLifecycle({ ...baseTicketType, status: "ARCHIVED" as const, quantity: 1, soldQuantity: 1 });
    expect(ticketTypeUpdate).not.toHaveBeenCalled();
  });
});

describe("listTicketTypesForEvent() / getTicketType() — availableQuantity", () => {
  it("quantity=null — availableQuantity=null", async () => {
    ticketTypeFindMany.mockResolvedValue([{ ...baseTicketType, quantity: null, soldQuantity: 5 }]);
    const [result] = await listTicketTypesForEvent("event1", owner);
    expect(result.availableQuantity).toBeNull();
  });

  it("quantity=50, soldQuantity=30 — availableQuantity=20", async () => {
    ticketTypeFindMany.mockResolvedValue([{ ...baseTicketType, quantity: 50, soldQuantity: 30 }]);
    const [result] = await listTicketTypesForEvent("event1", owner);
    expect(result.availableQuantity).toBe(20);
  });

  it("availableQuantity никогда не уходит в минус", async () => {
    ticketTypeFindMany.mockResolvedValue([{ ...baseTicketType, quantity: 10, soldQuantity: 12 }]);
    const [result] = await listTicketTypesForEvent("event1", owner);
    expect(result.availableQuantity).toBe(0);
  });

  it("чужое событие — RegistrationForbiddenError", async () => {
    eventFindUnique.mockResolvedValue({ id: "event1", createdById: "someone-else" });
    await expect(listTicketTypesForEvent("event1", owner)).rejects.toBeInstanceOf(RegistrationForbiddenError);
  });

  it("getTicketType() — тот же расчёт для одного TicketType", async () => {
    ticketTypeFindUnique.mockResolvedValue({ ...baseTicketType, quantity: 5, soldQuantity: 5, event });
    const result = await getTicketType("tt1", owner);
    expect(result.availableQuantity).toBe(0);
  });
});
