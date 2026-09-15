import { describe, it, expect, vi, beforeEach } from "vitest";
import type { User } from "@prisma/client";

// §11 ТЗ (Event CRM) — экспорт CSV. buildRegistrationsCsv — чистая функция,
// exportEventRegistrationsCsv — RBAC + запрос, мокается только @/lib/prisma
// (тот же приём, что и в registration-service.test.ts), hasEventAccess()
// выполняется по-настоящему.

const eventFindUnique = vi.fn();
const eventRegistrationFindMany = vi.fn();
const eventTeamMemberFindUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    event: { findUnique: (...a: unknown[]) => eventFindUnique(...a) },
    eventRegistration: { findMany: (...a: unknown[]) => eventRegistrationFindMany(...a) },
    eventTeamMember: { findUnique: (...a: unknown[]) => eventTeamMemberFindUnique(...a) },
  },
}));

const { buildRegistrationsCsv, exportEventRegistrationsCsv } = await import("@/server/events/registration-export");
const { RegistrationForbiddenError, RegistrationNotFoundError } = await import("@/server/events/registration-service");

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

const registrableEvent = { id: "event1", createdById: "user1" };
const user = makeUser();

beforeEach(() => {
  eventFindUnique.mockReset().mockResolvedValue(registrableEvent);
  eventRegistrationFindMany.mockReset().mockResolvedValue([]);
  eventTeamMemberFindUnique.mockReset().mockResolvedValue(null);
});

describe("buildRegistrationsCsv()", () => {
  it("пустой список — только заголовок", () => {
    const csv = buildRegistrationsCsv([]);
    expect(csv).toBe("﻿Участник,Дата регистрации,Статус,Оплата");
  });

  it("экранирует запятую в имени кавычками", () => {
    const csv = buildRegistrationsCsv([{ displayName: "Иванов, Иван", createdAt: new Date("2026-01-01T10:00:00Z"), status: "REGISTERED", isPaid: true }]);
    const rows = csv.replace("﻿", "").split("\r\n");
    expect(rows[1]).toMatch(/^"Иванов, Иван",/);
  });

  it("экранирует кавычку внутри значения удвоением", () => {
    const csv = buildRegistrationsCsv([{ displayName: 'Иван "Огонь"', createdAt: new Date(), status: "REGISTERED", isPaid: false }]);
    expect(csv).toContain('"Иван ""Огонь"""');
  });

  it("переводит статус в человекочитаемую метку и оплату в Да/Нет", () => {
    const csv = buildRegistrationsCsv([{ displayName: "A", createdAt: new Date(), status: "WAITLIST", isPaid: false }]);
    expect(csv).toContain("Лист ожидания");
    expect(csv).toContain(",Нет");
  });

  it("не экранирует обычные значения без запятых/кавычек/переносов", () => {
    const csv = buildRegistrationsCsv([{ displayName: "Просто Имя", createdAt: new Date(), status: "CONFIRMED", isPaid: true }]);
    expect(csv).toContain("Просто Имя,");
    expect(csv).not.toContain('"Просто Имя"');
  });
});

describe("exportEventRegistrationsCsv() — RBAC и фильтры", () => {
  it("чужое событие, не ADMIN — RegistrationForbiddenError, БД участников не читается", async () => {
    eventFindUnique.mockResolvedValue({ id: "event1", createdById: "someone-else" });

    await expect(exportEventRegistrationsCsv("event1", user, {})).rejects.toBeInstanceOf(RegistrationForbiddenError);
    expect(eventRegistrationFindMany).not.toHaveBeenCalled();
  });

  it("событие не найдено — RegistrationNotFoundError", async () => {
    eventFindUnique.mockResolvedValue(null);
    await expect(exportEventRegistrationsCsv("missing", user, {})).rejects.toBeInstanceOf(RegistrationNotFoundError);
  });

  it("владелец — экспортирует с учётом фильтра status", async () => {
    eventRegistrationFindMany.mockResolvedValue([
      { dancer: { displayName: "Тестов Тест" }, createdAt: new Date("2026-02-02T12:00:00Z"), status: "REJECTED", isPaid: false },
    ]);

    const csv = await exportEventRegistrationsCsv("event1", user, { status: "REJECTED" });

    expect(eventRegistrationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { eventId: "event1", status: "REJECTED" } })
    );
    expect(csv).toContain("Тестов Тест");
    expect(csv).toContain("Отклонён");
  });

  it("ограничивает выборку разумным максимумом строк (take)", async () => {
    await exportEventRegistrationsCsv("event1", user, {});
    expect(eventRegistrationFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: expect.any(Number) }));
  });
});
