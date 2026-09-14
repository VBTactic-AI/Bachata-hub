import { describe, it, expect, vi, beforeEach } from "vitest";
import type { User } from "@prisma/client";

// Events Engine, этап 2 — EventRegistration. НЕ путать с тестами Competition
// Registration (tests/competition/**) — другой домен, другая модель.

const dancerFindUnique = vi.fn();
const eventFindUnique = vi.fn();
const eventRegistrationFindUnique = vi.fn();
const eventRegistrationCount = vi.fn();
const eventRegistrationCreate = vi.fn();
const eventRegistrationUpdate = vi.fn();
const eventRegistrationFindMany = vi.fn();
const topLevelEventRegistrationCount = vi.fn();
const topLevelEventRegistrationFindUnique = vi.fn();
const topLevelEventRegistrationUpdate = vi.fn();
const executeRaw = vi.fn().mockResolvedValue(0);

const fakeTx = {
  $executeRaw: executeRaw,
  eventRegistration: {
    findUnique: eventRegistrationFindUnique,
    count: eventRegistrationCount,
    create: eventRegistrationCreate,
    update: eventRegistrationUpdate,
  },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    dancer: { findUnique: (...a: unknown[]) => dancerFindUnique(...a) },
    event: { findUnique: (...a: unknown[]) => eventFindUnique(...a) },
    eventRegistration: {
      findUnique: (...a: unknown[]) => topLevelEventRegistrationFindUnique(...a),
      findMany: (...a: unknown[]) => eventRegistrationFindMany(...a),
      count: (...a: unknown[]) => topLevelEventRegistrationCount(...a),
      update: (...a: unknown[]) => topLevelEventRegistrationUpdate(...a),
    },
    $transaction: (fn: (tx: typeof fakeTx) => unknown) => fn(fakeTx),
  },
}));

const {
  registerForEvent,
  cancelMyRegistration,
  listEventRegistrations,
  updateEventRegistration,
  NoDancerProfileError,
  RegistrationClosedError,
  RegistrationForbiddenError,
  RegistrationNotFoundError,
} = await import("@/server/events/registration-service");

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "user1",
    email: "u@example.com",
    passwordHash: null,
    supabaseUserId: null,
    role: "DANCER",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastLoginAt: null,
    isBlocked: false,
    isVerifiedEventOrganizer: false,
    isVerifiedFestivalOrganizer: false,
    ...overrides,
  };
}

const registrableEvent = {
  id: "event1",
  createdById: "organizer1",
  registrationEnabled: true,
  status: "PUBLISHED",
  moderationStatus: "APPROVED",
  capacity: null,
};

const dancer = { id: "dancer1", userId: "user1" };
const user = makeUser();

beforeEach(() => {
  dancerFindUnique.mockReset().mockResolvedValue(dancer);
  eventFindUnique.mockReset().mockResolvedValue(registrableEvent);
  eventRegistrationFindUnique.mockReset().mockResolvedValue(null);
  eventRegistrationCount.mockReset().mockResolvedValue(0);
  eventRegistrationCreate.mockReset().mockResolvedValue({ id: "reg1", status: "REGISTERED" });
  eventRegistrationUpdate.mockReset().mockResolvedValue({ id: "reg1", status: "REGISTERED" });
  eventRegistrationFindMany.mockReset().mockResolvedValue([]);
  topLevelEventRegistrationCount.mockReset().mockResolvedValue(0);
  topLevelEventRegistrationFindUnique.mockReset().mockResolvedValue(null);
  topLevelEventRegistrationUpdate.mockReset();
  executeRaw.mockClear();
});

describe("registerForEvent()", () => {
  it("нет профиля танцора — NoDancerProfileError", async () => {
    dancerFindUnique.mockResolvedValue(null);
    await expect(registerForEvent("event1", user)).rejects.toBeInstanceOf(NoDancerProfileError);
  });

  it("регистрация выключена у события — RegistrationClosedError", async () => {
    eventFindUnique.mockResolvedValue({ ...registrableEvent, registrationEnabled: false });
    await expect(registerForEvent("event1", user)).rejects.toBeInstanceOf(RegistrationClosedError);
  });

  it("событие не опубликовано/не прошло модерацию — RegistrationClosedError", async () => {
    eventFindUnique.mockResolvedValue({ ...registrableEvent, moderationStatus: "PENDING" });
    await expect(registerForEvent("event1", user)).rejects.toBeInstanceOf(RegistrationClosedError);
  });

  it("новая регистрация без лимита capacity — REGISTERED, лочит событие advisory-локом", async () => {
    await registerForEvent("event1", user);

    expect(executeRaw).toHaveBeenCalled();
    expect(eventRegistrationCreate).toHaveBeenCalledWith({
      data: { eventId: "event1", dancerId: "dancer1", status: "REGISTERED" },
    });
  });

  it("capacity уже заполнен активными регистрациями — WAITLIST", async () => {
    eventFindUnique.mockResolvedValue({ ...registrableEvent, capacity: 2 });
    eventRegistrationCount.mockResolvedValue(2);

    await registerForEvent("event1", user);

    expect(eventRegistrationCreate).toHaveBeenCalledWith({
      data: { eventId: "event1", dancerId: "dancer1", status: "WAITLIST" },
    });
  });

  it("есть свободное место по capacity — REGISTERED", async () => {
    eventFindUnique.mockResolvedValue({ ...registrableEvent, capacity: 5 });
    eventRegistrationCount.mockResolvedValue(3);

    await registerForEvent("event1", user);

    expect(eventRegistrationCreate).toHaveBeenCalledWith({
      data: { eventId: "event1", dancerId: "dancer1", status: "REGISTERED" },
    });
  });

  it("уже REGISTERED — идемпотентно, create/update не вызываются повторно", async () => {
    const existing = { id: "reg1", status: "REGISTERED" };
    eventRegistrationFindUnique.mockResolvedValue(existing);

    const result = await registerForEvent("event1", user);

    expect(result).toBe(existing);
    expect(eventRegistrationCreate).not.toHaveBeenCalled();
    expect(eventRegistrationUpdate).not.toHaveBeenCalled();
  });

  it("была CANCELLED — реактивирует существующую строку вместо дубликата", async () => {
    eventRegistrationFindUnique.mockResolvedValue({ id: "reg1", status: "CANCELLED" });

    await registerForEvent("event1", user);

    expect(eventRegistrationCreate).not.toHaveBeenCalled();
    expect(eventRegistrationUpdate).toHaveBeenCalledWith({
      where: { id: "reg1" },
      data: { status: "REGISTERED", isPaid: false, paidAt: null, cancelledAt: null },
    });
  });

  it("REJECTED организатором — участник не может сам себя вернуть в очередь", async () => {
    eventRegistrationFindUnique.mockResolvedValue({ id: "reg1", status: "REJECTED" });

    await expect(registerForEvent("event1", user)).rejects.toBeInstanceOf(RegistrationForbiddenError);
    expect(eventRegistrationUpdate).not.toHaveBeenCalled();
  });
});

describe("cancelMyRegistration()", () => {
  it("нет регистрации — RegistrationNotFoundError", async () => {
    topLevelEventRegistrationFindUnique.mockResolvedValue(null);
    await expect(cancelMyRegistration("event1", user)).rejects.toBeInstanceOf(RegistrationNotFoundError);
  });

  it("уже CANCELLED — идемпотентно, update не вызывается", async () => {
    const existing = { id: "reg1", status: "CANCELLED" };
    topLevelEventRegistrationFindUnique.mockResolvedValue(existing);

    const result = await cancelMyRegistration("event1", user);

    expect(result).toBe(existing);
    expect(topLevelEventRegistrationUpdate).not.toHaveBeenCalled();
  });

  it("активная регистрация — переводит в CANCELLED", async () => {
    topLevelEventRegistrationFindUnique.mockResolvedValue({ id: "reg1", status: "REGISTERED" });
    topLevelEventRegistrationUpdate.mockResolvedValue({ id: "reg1", status: "CANCELLED" });

    await cancelMyRegistration("event1", user);

    expect(topLevelEventRegistrationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "reg1" }, data: expect.objectContaining({ status: "CANCELLED" }) })
    );
  });
});

describe("listEventRegistrations() — owner-check", () => {
  it("чужое событие, не ADMIN — RegistrationForbiddenError", async () => {
    eventFindUnique.mockResolvedValue({ ...registrableEvent, createdById: "someone-else" });
    await expect(listEventRegistrations("event1", user)).rejects.toBeInstanceOf(RegistrationForbiddenError);
  });

  it("владелец события — видит страницу результатов с пагинацией", async () => {
    eventFindUnique.mockResolvedValue({ ...registrableEvent, createdById: "user1" });
    eventRegistrationFindMany.mockResolvedValue([{ id: "reg1" }]);
    topLevelEventRegistrationCount.mockResolvedValue(1);

    const result = await listEventRegistrations("event1", user, { page: 1, pageSize: 50 });

    expect(result).toEqual({ items: [{ id: "reg1" }], total: 1, page: 1, pageSize: 50 });
  });

  it("ADMIN видит чужое событие", async () => {
    eventFindUnique.mockResolvedValue({ ...registrableEvent, createdById: "someone-else" });
    const admin = makeUser({ role: "ADMIN" });

    await expect(listEventRegistrations("event1", admin)).resolves.toBeDefined();
  });
});

describe("updateEventRegistration() — owner-check", () => {
  it("чужое событие, не ADMIN — RegistrationForbiddenError", async () => {
    topLevelEventRegistrationFindUnique.mockResolvedValue({
      id: "reg1",
      event: { ...registrableEvent, createdById: "someone-else" },
    });

    await expect(updateEventRegistration("reg1", user, { isPaid: true })).rejects.toBeInstanceOf(RegistrationForbiddenError);
  });

  it("владелец — переключает isPaid, ставит paidAt", async () => {
    topLevelEventRegistrationFindUnique.mockResolvedValue({
      id: "reg1",
      event: { ...registrableEvent, createdById: "user1" },
    });

    await updateEventRegistration("reg1", user, { isPaid: true });

    expect(topLevelEventRegistrationUpdate).toHaveBeenCalledWith({
      where: { id: "reg1" },
      data: expect.objectContaining({ isPaid: true, paidAt: expect.any(Date) }),
    });
  });

  it("владелец — меняет статус на CANCELLED, ставит cancelledAt", async () => {
    topLevelEventRegistrationFindUnique.mockResolvedValue({
      id: "reg1",
      event: { ...registrableEvent, createdById: "user1" },
    });

    await updateEventRegistration("reg1", user, { status: "CANCELLED" });

    expect(topLevelEventRegistrationUpdate).toHaveBeenCalledWith({
      where: { id: "reg1" },
      data: expect.objectContaining({ status: "CANCELLED", cancelledAt: expect.any(Date) }),
    });
  });

  it("регистрация не найдена — RegistrationNotFoundError", async () => {
    topLevelEventRegistrationFindUnique.mockResolvedValue(null);
    await expect(updateEventRegistration("missing", user, { isPaid: true })).rejects.toBeInstanceOf(RegistrationNotFoundError);
  });
});
