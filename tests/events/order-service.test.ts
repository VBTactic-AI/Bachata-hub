import { describe, it, expect, vi, beforeEach } from "vitest";
import type { User } from "@prisma/client";

// Commerce Engine v1 (2026-09-17) — order-service.ts, витрина Order/Payment/
// Refund только для чтения. Доступ — isOwnerOrAdmin (финансовые данные, не
// hasEventAccess — см. комментарий в order-service.ts).

const eventFindUnique = vi.fn();
const orderFindMany = vi.fn();
const orderFindUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    event: { findUnique: (...a: unknown[]) => eventFindUnique(...a) },
    order: {
      findMany: (...a: unknown[]) => orderFindMany(...a),
      findUnique: (...a: unknown[]) => orderFindUnique(...a),
    },
  },
}));

const { listOrdersForEvent, getOrder } = await import("@/server/events/order-service");
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
const admin = makeUser({ id: "admin1", role: "ADMIN" });

beforeEach(() => {
  eventFindUnique.mockReset().mockResolvedValue(event);
  orderFindMany.mockReset().mockResolvedValue([]);
  orderFindUnique.mockReset();
});

describe("listOrdersForEvent()", () => {
  it("владелец события — видит список заказов", async () => {
    orderFindMany.mockResolvedValue([{ id: "order1" }]);
    const result = await listOrdersForEvent("event1", owner);
    expect(result).toEqual([{ id: "order1" }]);
    expect(orderFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { eventId: "event1" }, orderBy: { createdAt: "desc" } }));
  });

  it("ADMIN — тоже видит (isOwnerOrAdmin)", async () => {
    orderFindMany.mockResolvedValue([{ id: "order1" }]);
    await expect(listOrdersForEvent("event1", admin)).resolves.toEqual([{ id: "order1" }]);
  });

  it("рядовой член команды (не владелец, не ADMIN) — RegistrationForbiddenError, не hasEventAccess", async () => {
    const someoneElse = makeUser({ id: "team-member" });
    await expect(listOrdersForEvent("event1", someoneElse)).rejects.toBeInstanceOf(RegistrationForbiddenError);
  });

  it("событие не найдено — RegistrationNotFoundError", async () => {
    eventFindUnique.mockResolvedValue(null);
    await expect(listOrdersForEvent("missing", owner)).rejects.toBeInstanceOf(RegistrationNotFoundError);
  });
});

describe("getOrder()", () => {
  it("заказ не найден — RegistrationNotFoundError", async () => {
    orderFindUnique.mockResolvedValue(null);
    await expect(getOrder("missing", owner)).rejects.toBeInstanceOf(RegistrationNotFoundError);
  });

  it("чужое событие — RegistrationForbiddenError", async () => {
    orderFindUnique.mockResolvedValue({ id: "order1", eventId: "event1" });
    eventFindUnique.mockResolvedValue({ id: "event1", createdById: "someone-else" });
    await expect(getOrder("order1", owner)).rejects.toBeInstanceOf(RegistrationForbiddenError);
  });

  it("владелец — получает заказ", async () => {
    orderFindUnique.mockResolvedValue({ id: "order1", eventId: "event1" });
    await expect(getOrder("order1", owner)).resolves.toEqual({ id: "order1", eventId: "event1" });
  });
});
