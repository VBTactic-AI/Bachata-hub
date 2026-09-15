import { describe, it, expect, vi, beforeEach } from "vitest";
import type { User } from "@prisma/client";

// Events Engine, этап 2 + QA-фиксы (2026-09-15) — EventRegistration. НЕ
// путать с тестами Competition Registration (tests/competition/**) —
// другой домен, другая модель.

const dancerFindUnique = vi.fn();
const eventFindUnique = vi.fn(); // prisma.event.findUnique — вне транзакций (requireRegistrableEvent/listEventRegistrations/updateEventRegistration access-check)
const topLevelEventRegistrationFindUnique = vi.fn(); // prisma.eventRegistration.findUnique — access-check в updateEventRegistration
const eventRegistrationFindMany = vi.fn(); // listEventRegistrations
const topLevelEventRegistrationCount = vi.fn(); // listEventRegistrations — сводные счётчики
const executeRaw = vi.fn().mockResolvedValue(0);
// Events Engine, этап 5 — hasEventAccess (src/server/events/access.ts) query
// команды события; в тестах владелец/ADMIN всегда short-circuit'ят раньше
// этого запроса, но mock всё равно должен существовать для "чужого события".
const eventTeamMemberFindUnique = vi.fn().mockResolvedValue(null);

// §20 ТЗ — уведомления о регистрации (подтверждена/отклонена/отменена),
// добавлены поверх этапов 2/QA-фиксов. Мокаем по тому же образцу, что и
// tests/events/event-service.test.ts (emitDomainEventMock).
const emitDomainEventMock = vi.fn();
vi.mock("@/server/notifications/emit-domain-event", () => ({
  emitDomainEvent: (...a: unknown[]) => emitDomainEventMock(...a),
}));

// Всё, что теперь происходит ВНУТРИ prisma.$transaction (registerForEvent,
// cancelMyRegistration, updateEventRegistration — QA BUG-004/005/006
// добавили lock+promote во все три пути).
const txEventRegistrationFindUnique = vi.fn();
const txEventRegistrationFindUniqueOrThrow = vi.fn();
const txEventRegistrationFindFirst = vi.fn();
const txEventRegistrationCount = vi.fn();
const txEventRegistrationCreate = vi.fn();
const txEventRegistrationUpdate = vi.fn();
const txEventFindUniqueOrThrow = vi.fn();

const fakeTx = {
  $executeRaw: executeRaw,
  eventRegistration: {
    findUnique: txEventRegistrationFindUnique,
    findUniqueOrThrow: txEventRegistrationFindUniqueOrThrow,
    findFirst: txEventRegistrationFindFirst,
    count: txEventRegistrationCount,
    create: txEventRegistrationCreate,
    update: txEventRegistrationUpdate,
  },
  event: {
    findUniqueOrThrow: txEventFindUniqueOrThrow,
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
    },
    eventTeamMember: { findUnique: (...a: unknown[]) => eventTeamMemberFindUnique(...a) },
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
  CapacityExceededError,
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
  capacity: null as number | null,
};

const dancer = { id: "dancer1", userId: "user1" };
const user = makeUser();

beforeEach(() => {
  dancerFindUnique.mockReset().mockResolvedValue(dancer);
  eventFindUnique.mockReset().mockResolvedValue(registrableEvent);
  eventTeamMemberFindUnique.mockReset().mockResolvedValue(null);
  topLevelEventRegistrationFindUnique.mockReset().mockResolvedValue(null);
  eventRegistrationFindMany.mockReset().mockResolvedValue([]);
  topLevelEventRegistrationCount.mockReset().mockResolvedValue(0);
  executeRaw.mockClear();
  emitDomainEventMock.mockReset();

  txEventRegistrationFindUnique.mockReset().mockResolvedValue(null);
  txEventRegistrationFindUniqueOrThrow.mockReset();
  txEventRegistrationFindFirst.mockReset().mockResolvedValue(null);
  txEventRegistrationCount.mockReset().mockResolvedValue(0);
  txEventRegistrationCreate.mockReset().mockResolvedValue({ id: "reg1", status: "REGISTERED" });
  // updatedAt нужен всем тестам, где статус меняется — код теперь строит
  // idempotencyKey уведомления из updated.updatedAt (см. registration-service.ts).
  txEventRegistrationUpdate.mockReset().mockResolvedValue({ id: "reg1", status: "REGISTERED", updatedAt: new Date() });
  txEventFindUniqueOrThrow.mockReset().mockResolvedValue({ capacity: null });
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
    expect(txEventRegistrationCreate).toHaveBeenCalledWith({
      data: { eventId: "event1", dancerId: "dancer1", status: "REGISTERED" },
    });
  });

  it("capacity уже заполнен активными регистрациями — WAITLIST", async () => {
    eventFindUnique.mockResolvedValue({ ...registrableEvent, capacity: 2 });
    txEventRegistrationCount.mockResolvedValue(2);

    await registerForEvent("event1", user);

    expect(txEventRegistrationCreate).toHaveBeenCalledWith({
      data: { eventId: "event1", dancerId: "dancer1", status: "WAITLIST" },
    });
  });

  it("есть свободное место по capacity — REGISTERED", async () => {
    eventFindUnique.mockResolvedValue({ ...registrableEvent, capacity: 5 });
    txEventRegistrationCount.mockResolvedValue(3);

    await registerForEvent("event1", user);

    expect(txEventRegistrationCreate).toHaveBeenCalledWith({
      data: { eventId: "event1", dancerId: "dancer1", status: "REGISTERED" },
    });
  });

  it("уже REGISTERED — идемпотентно, create/update не вызываются повторно", async () => {
    const existing = { id: "reg1", status: "REGISTERED" };
    txEventRegistrationFindUnique.mockResolvedValue(existing);

    const result = await registerForEvent("event1", user);

    expect(result).toBe(existing);
    expect(txEventRegistrationCreate).not.toHaveBeenCalled();
    expect(txEventRegistrationUpdate).not.toHaveBeenCalled();
  });

  it("была CANCELLED — реактивирует существующую строку вместо дубликата", async () => {
    txEventRegistrationFindUnique.mockResolvedValue({ id: "reg1", status: "CANCELLED" });

    await registerForEvent("event1", user);

    expect(txEventRegistrationCreate).not.toHaveBeenCalled();
    expect(txEventRegistrationUpdate).toHaveBeenCalledWith({
      where: { id: "reg1" },
      data: { status: "REGISTERED", isPaid: false, paidAt: null, cancelledAt: null },
    });
  });

  it("REJECTED организатором — участник не может сам себя вернуть в очередь", async () => {
    txEventRegistrationFindUnique.mockResolvedValue({ id: "reg1", status: "REJECTED" });

    await expect(registerForEvent("event1", user)).rejects.toBeInstanceOf(RegistrationForbiddenError);
    expect(txEventRegistrationUpdate).not.toHaveBeenCalled();
  });
});

describe("cancelMyRegistration()", () => {
  it("нет регистрации — RegistrationNotFoundError", async () => {
    txEventRegistrationFindUnique.mockResolvedValue(null);
    await expect(cancelMyRegistration("event1", user)).rejects.toBeInstanceOf(RegistrationNotFoundError);
  });

  it("уже CANCELLED — идемпотентно, update не вызывается", async () => {
    const existing = { id: "reg1", status: "CANCELLED" };
    txEventRegistrationFindUnique.mockResolvedValue(existing);

    const result = await cancelMyRegistration("event1", user);

    expect(result).toBe(existing);
    expect(txEventRegistrationUpdate).not.toHaveBeenCalled();
  });

  // QA BUG-005 regression
  it("REJECTED — участник не может сам отменить решение организатора", async () => {
    txEventRegistrationFindUnique.mockResolvedValue({ id: "reg1", status: "REJECTED" });
    await expect(cancelMyRegistration("event1", user)).rejects.toBeInstanceOf(RegistrationForbiddenError);
    expect(txEventRegistrationUpdate).not.toHaveBeenCalled();
  });

  it("NO_SHOW — участник не может сам отменить решение организатора", async () => {
    txEventRegistrationFindUnique.mockResolvedValue({ id: "reg1", status: "NO_SHOW" });
    await expect(cancelMyRegistration("event1", user)).rejects.toBeInstanceOf(RegistrationForbiddenError);
    expect(txEventRegistrationUpdate).not.toHaveBeenCalled();
  });

  it("активная регистрация без capacity — переводит в CANCELLED, без промоушена", async () => {
    txEventRegistrationFindUnique.mockResolvedValue({ id: "reg1", status: "REGISTERED" });
    txEventRegistrationUpdate.mockResolvedValue({ id: "reg1", status: "CANCELLED" });
    txEventFindUniqueOrThrow.mockResolvedValue({ capacity: null });

    await cancelMyRegistration("event1", user);

    expect(txEventRegistrationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "reg1" }, data: expect.objectContaining({ status: "CANCELLED" }) })
    );
    expect(txEventRegistrationFindFirst).not.toHaveBeenCalled();
  });

  // QA BUG-006 regression
  it("активная регистрация с capacity и WAITLIST в очереди — промоутит следующего", async () => {
    txEventRegistrationFindUnique.mockResolvedValue({ id: "reg1", status: "REGISTERED" });
    txEventFindUniqueOrThrow.mockResolvedValue({ id: "event1", slug: "party", title: "Party", capacity: 2 });
    txEventRegistrationCount.mockResolvedValue(1); // после отмены — 1 активный из 2 мест
    txEventRegistrationFindFirst.mockResolvedValue({ id: "waitlisted1", dancer: { userId: "waitlisted-user1" } });

    await cancelMyRegistration("event1", user);

    expect(txEventRegistrationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "reg1" }, data: expect.objectContaining({ status: "CANCELLED" }) })
    );
    expect(txEventRegistrationUpdate).toHaveBeenCalledWith({ where: { id: "waitlisted1" }, data: { status: "REGISTERED" } });
    // §20 ТЗ — продвинутый по очереди участник получает уведомление "подтверждена"
    expect(emitDomainEventMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: "EVENT_REGISTRATION_CONFIRMED",
        payload: expect.objectContaining({ directUserId: "waitlisted-user1", entityId: "event1" }),
      })
    );
  });

  it("места всё ещё нет (capacity уже занята другими) — WAITLIST не трогается", async () => {
    txEventRegistrationFindUnique.mockResolvedValue({ id: "reg1", status: "WAITLIST" }); // сам отменяющий не был активным
    txEventFindUniqueOrThrow.mockResolvedValue({ capacity: 2 });

    await cancelMyRegistration("event1", user);

    // wasActive=false (WAITLIST) — промоушен вообще не должен запускаться
    expect(txEventRegistrationFindFirst).not.toHaveBeenCalled();
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

    expect(result).toEqual({ items: [{ id: "reg1" }], total: 1, page: 1, pageSize: 50, paidCount: 1, waitlistCount: 1 });
  });

  it("ADMIN видит чужое событие", async () => {
    eventFindUnique.mockResolvedValue({ ...registrableEvent, createdById: "someone-else" });
    const admin = makeUser({ role: "ADMIN" });

    await expect(listEventRegistrations("event1", admin)).resolves.toBeDefined();
  });

  // QA Test Gap #15 — граница клэмпа pageSize на 100 не была проверена
  describe("пагинация — клэмп pageSize (QA Test Gap #15)", () => {
    it("pageSize > 100 обрезается до 100", async () => {
      eventFindUnique.mockResolvedValue({ ...registrableEvent, createdById: "user1" });

      const result = await listEventRegistrations("event1", user, { page: 1, pageSize: 500 });

      expect(result.pageSize).toBe(100);
      expect(eventRegistrationFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 100, skip: 0 }));
    });

    it("pageSize <= 0 поднимается до 1", async () => {
      eventFindUnique.mockResolvedValue({ ...registrableEvent, createdById: "user1" });

      const result = await listEventRegistrations("event1", user, { page: 1, pageSize: 0 });

      expect(result.pageSize).toBe(1);
    });

    it("page <= 0 поднимается до 1 (skip не уходит в отрицательные значения)", async () => {
      eventFindUnique.mockResolvedValue({ ...registrableEvent, createdById: "user1" });

      const result = await listEventRegistrations("event1", user, { page: -3, pageSize: 50 });

      expect(result.page).toBe(1);
      expect(eventRegistrationFindMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0 }));
    });

    it("page=3, pageSize=50 — skip считается корректно (100)", async () => {
      eventFindUnique.mockResolvedValue({ ...registrableEvent, createdById: "user1" });

      await listEventRegistrations("event1", user, { page: 3, pageSize: 50 });

      expect(eventRegistrationFindMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 100, take: 50 }));
    });
  });
});

describe("updateEventRegistration() — owner-check", () => {
  it("чужое событие, не ADMIN — RegistrationForbiddenError", async () => {
    topLevelEventRegistrationFindUnique.mockResolvedValue({
      id: "reg1",
      eventId: "event1",
      event: { ...registrableEvent, createdById: "someone-else" },
    });

    await expect(updateEventRegistration("reg1", user, { isPaid: true })).rejects.toBeInstanceOf(RegistrationForbiddenError);
  });

  // QA Test Gap #10 — раньше проверялось только "чужой организатор", не
  // конкретно "сам участник пытается выставить isPaid=true себе". Механика
  // та же (hasEventAccess не пропускает никого, кроме владельца/ADMIN/team),
  // но это отдельное, явно названное свойство безопасности — участник не
  // может сам себя отметить оплаченным, минуя организатора.
  it("сам участник (владелец регистрации, не события) не может выставить себе isPaid=true", async () => {
    const participant = makeUser({ id: "participant1" });
    topLevelEventRegistrationFindUnique.mockResolvedValue({
      id: "reg1",
      eventId: "event1",
      dancerId: "dancer-of-participant1",
      event: { ...registrableEvent, createdById: "organizer1" },
    });

    await expect(updateEventRegistration("reg1", participant, { isPaid: true })).rejects.toBeInstanceOf(RegistrationForbiddenError);
    expect(txEventRegistrationUpdate).not.toHaveBeenCalled();
  });

  it("владелец — переключает isPaid, ставит paidAt", async () => {
    topLevelEventRegistrationFindUnique.mockResolvedValue({
      id: "reg1",
      eventId: "event1",
      event: { ...registrableEvent, createdById: "user1" },
    });
    txEventRegistrationFindUniqueOrThrow.mockResolvedValue({ id: "reg1", status: "REGISTERED" });

    await updateEventRegistration("reg1", user, { isPaid: true });

    expect(txEventRegistrationUpdate).toHaveBeenCalledWith({
      where: { id: "reg1" },
      data: expect.objectContaining({ isPaid: true, paidAt: expect.any(Date) }),
    });
  });

  // 2026-09-15, по прямому запросу пользователя — CANCELLED теперь
  // зарезервирован только за самим участником (симметрично тому, как
  // REJECTED/NO_SHOW зарезервированы только за организатором).
  describe("CANCELLED зарезервирован за участником (2026-09-15)", () => {
    it("организатор пытается назначить CANCELLED напрямую — RegistrationForbiddenError, update не вызывается", async () => {
      topLevelEventRegistrationFindUnique.mockResolvedValue({
        id: "reg1",
        eventId: "event1",
        event: { ...registrableEvent, createdById: "user1", capacity: null },
        dancer: { userId: "participant1" },
      });

      await expect(updateEventRegistration("reg1", user, { status: "CANCELLED" })).rejects.toBeInstanceOf(RegistrationForbiddenError);
      expect(txEventRegistrationUpdate).not.toHaveBeenCalled();
      expect(emitDomainEventMock).not.toHaveBeenCalled();
    });

    it("регистрация уже CANCELLED — организатор не может изменить её статус вообще, даже на REGISTERED", async () => {
      topLevelEventRegistrationFindUnique.mockResolvedValue({
        id: "reg1",
        eventId: "event1",
        status: "CANCELLED",
        event: { ...registrableEvent, createdById: "user1", capacity: null },
        dancer: { userId: "participant1" },
      });

      await expect(updateEventRegistration("reg1", user, { status: "REGISTERED" })).rejects.toBeInstanceOf(RegistrationForbiddenError);
      expect(txEventRegistrationUpdate).not.toHaveBeenCalled();
    });

    it("регистрация уже CANCELLED — isPaid всё ещё можно менять (guard только про status)", async () => {
      topLevelEventRegistrationFindUnique.mockResolvedValue({
        id: "reg1",
        eventId: "event1",
        status: "CANCELLED",
        event: { ...registrableEvent, createdById: "user1", capacity: null },
        dancer: { userId: "participant1" },
      });
      txEventRegistrationFindUniqueOrThrow.mockResolvedValue({ id: "reg1", status: "CANCELLED" });

      await updateEventRegistration("reg1", user, { isPaid: true });

      expect(txEventRegistrationUpdate).toHaveBeenCalledWith({
        where: { id: "reg1" },
        data: expect.objectContaining({ isPaid: true }),
      });
    });
  });

  // §20 ТЗ (продолжение) — организатор вручную возвращает активного участника
  // в лист ожидания: освобождает его место (см. auto-promote ниже) и
  // одновременно уведомляет демотированного, что его подвинули.
  it("владелец — переводит активного участника обратно в WAITLIST — эмитит EVENT_REGISTRATION_WAITLISTED", async () => {
    topLevelEventRegistrationFindUnique.mockResolvedValue({
      id: "reg1",
      eventId: "event1",
      event: { ...registrableEvent, createdById: "user1", capacity: null },
      dancer: { userId: "participant1" },
    });
    txEventRegistrationFindUniqueOrThrow.mockResolvedValue({ id: "reg1", status: "REGISTERED" });

    await updateEventRegistration("reg1", user, { status: "WAITLIST" });

    expect(txEventRegistrationUpdate).toHaveBeenCalledWith({ where: { id: "reg1" }, data: { status: "WAITLIST" } });
    expect(emitDomainEventMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: "EVENT_REGISTRATION_WAITLISTED", payload: expect.objectContaining({ directUserId: "participant1" }) })
    );
  });

  it("регистрация не найдена — RegistrationNotFoundError", async () => {
    topLevelEventRegistrationFindUnique.mockResolvedValue(null);
    await expect(updateEventRegistration("missing", user, { isPaid: true })).rejects.toBeInstanceOf(RegistrationNotFoundError);
  });

  // QA BUG-004 regression — главный найденный баг: организатор промоутит
  // WAITLIST сверх Event.capacity без единой проверки.
  describe("capacity guard (QA BUG-004)", () => {
    it("мест больше нет — WAITLIST->REGISTERED отклоняется с понятной ошибкой", async () => {
      topLevelEventRegistrationFindUnique.mockResolvedValue({
        id: "reg1",
        eventId: "event1",
        event: { ...registrableEvent, createdById: "user1", capacity: 2 },
      });
      txEventRegistrationFindUniqueOrThrow.mockResolvedValue({ id: "reg1", status: "WAITLIST" });
      txEventRegistrationCount.mockResolvedValue(2); // уже 2 из 2 мест заняты

      await expect(updateEventRegistration("reg1", user, { status: "REGISTERED" })).rejects.toBeInstanceOf(CapacityExceededError);
      expect(txEventRegistrationUpdate).not.toHaveBeenCalled();
    });

    it("мест больше нет — WAITLIST->CONFIRMED тоже отклоняется", async () => {
      topLevelEventRegistrationFindUnique.mockResolvedValue({
        id: "reg1",
        eventId: "event1",
        event: { ...registrableEvent, createdById: "user1", capacity: 2 },
      });
      txEventRegistrationFindUniqueOrThrow.mockResolvedValue({ id: "reg1", status: "WAITLIST" });
      txEventRegistrationCount.mockResolvedValue(2);

      await expect(updateEventRegistration("reg1", user, { status: "CONFIRMED" })).rejects.toBeInstanceOf(CapacityExceededError);
    });

    it("есть свободное место — WAITLIST->REGISTERED проходит", async () => {
      topLevelEventRegistrationFindUnique.mockResolvedValue({
        id: "reg1",
        eventId: "event1",
        event: { ...registrableEvent, createdById: "user1", capacity: 3 },
        dancer: { userId: "participant1" },
      });
      txEventRegistrationFindUniqueOrThrow.mockResolvedValue({ id: "reg1", status: "WAITLIST" });
      txEventRegistrationCount.mockResolvedValue(2);
      txEventRegistrationUpdate.mockResolvedValue({ id: "reg1", status: "REGISTERED", updatedAt: new Date() });

      await updateEventRegistration("reg1", user, { status: "REGISTERED" });

      expect(txEventRegistrationUpdate).toHaveBeenCalledWith({ where: { id: "reg1" }, data: { status: "REGISTERED" } });
      // §20 ТЗ — промоушен из листа ожидания вручную организатором — тоже "подтверждена"
      expect(emitDomainEventMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ type: "EVENT_REGISTRATION_CONFIRMED", payload: expect.objectContaining({ directUserId: "participant1" }) })
      );
    });

    it("REGISTERED->CONFIRMED (уже активен по обе стороны) — capacity не пересчитывается", async () => {
      topLevelEventRegistrationFindUnique.mockResolvedValue({
        id: "reg1",
        eventId: "event1",
        event: { ...registrableEvent, createdById: "user1", capacity: 1 },
        dancer: { userId: "participant1" },
      });
      txEventRegistrationFindUniqueOrThrow.mockResolvedValue({ id: "reg1", status: "REGISTERED" });

      await updateEventRegistration("reg1", user, { status: "CONFIRMED" });

      expect(txEventRegistrationCount).not.toHaveBeenCalled();
      expect(txEventRegistrationUpdate).toHaveBeenCalledWith({ where: { id: "reg1" }, data: { status: "CONFIRMED" } });
      // §20 ТЗ — явное подтверждение организатором тоже "подтверждена", даже без перехода из неактивного статуса
      expect(emitDomainEventMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ type: "EVENT_REGISTRATION_CONFIRMED", payload: expect.objectContaining({ directUserId: "participant1" }) })
      );
    });

    it("без лимита capacity (null) — WAITLIST->REGISTERED всегда проходит", async () => {
      topLevelEventRegistrationFindUnique.mockResolvedValue({
        id: "reg1",
        eventId: "event1",
        event: { ...registrableEvent, createdById: "user1", capacity: null },
        dancer: { userId: "participant1" },
      });
      txEventRegistrationFindUniqueOrThrow.mockResolvedValue({ id: "reg1", status: "WAITLIST" });

      await updateEventRegistration("reg1", user, { status: "REGISTERED" });

      expect(txEventRegistrationCount).not.toHaveBeenCalled();
      expect(txEventRegistrationUpdate).toHaveBeenCalledWith({ where: { id: "reg1" }, data: { status: "REGISTERED" } });
    });
  });

  // QA BUG-006 regression — организатор освобождает место, следующий WAITLIST продвигается
  describe("auto-promote on release (QA BUG-006)", () => {
    it("REGISTERED->REJECTED освобождает место — промоутит следующего WAITLIST", async () => {
      topLevelEventRegistrationFindUnique.mockResolvedValue({
        id: "reg1",
        eventId: "event1",
        event: { ...registrableEvent, createdById: "user1", capacity: 2 },
        dancer: { userId: "participant1" },
      });
      txEventRegistrationFindUniqueOrThrow.mockResolvedValue({ id: "reg1", status: "REGISTERED" });
      txEventRegistrationUpdate.mockResolvedValueOnce({ id: "reg1", status: "REJECTED", updatedAt: new Date() });
      txEventRegistrationCount.mockResolvedValue(1); // после отказа — 1 активный из 2
      txEventRegistrationFindFirst.mockResolvedValue({ id: "waitlisted1", dancer: { userId: "waitlisted-user1" } });

      await updateEventRegistration("reg1", user, { status: "REJECTED" });

      expect(txEventRegistrationUpdate).toHaveBeenCalledWith({ where: { id: "waitlisted1" }, data: { status: "REGISTERED" } });
      // §20 ТЗ — отклонённый получает REJECTED, продвинутый по очереди — CONFIRMED
      expect(emitDomainEventMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ type: "EVENT_REGISTRATION_REJECTED", payload: expect.objectContaining({ directUserId: "participant1" }) })
      );
      expect(emitDomainEventMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ type: "EVENT_REGISTRATION_CONFIRMED", payload: expect.objectContaining({ directUserId: "waitlisted-user1" }) })
      );
    });

    it("статус не меняется (только isPaid) — промоушен не запускается", async () => {
      topLevelEventRegistrationFindUnique.mockResolvedValue({
        id: "reg1",
        eventId: "event1",
        event: { ...registrableEvent, createdById: "user1", capacity: 2 },
      });
      txEventRegistrationFindUniqueOrThrow.mockResolvedValue({ id: "reg1", status: "REGISTERED" });

      await updateEventRegistration("reg1", user, { isPaid: true });

      expect(txEventRegistrationFindFirst).not.toHaveBeenCalled();
    });
  });
});
