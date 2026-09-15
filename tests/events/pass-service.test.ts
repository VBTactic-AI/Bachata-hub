import { describe, it, expect, vi, beforeEach } from "vitest";
import type { User } from "@prisma/client";

// Ticket Engine (2026-09-16) — Pass CRUD. Управление Pass — только владелец
// события/ADMIN (isOwnerOrAdmin, синхронная проверка, без запроса к
// eventTeamMember) — тот же принцип, что и team-service.ts.

const eventFindUnique = vi.fn();
const passFindUnique = vi.fn();
const passFindMany = vi.fn();
const passCreate = vi.fn();
const passUpdate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    event: { findUnique: (...a: unknown[]) => eventFindUnique(...a) },
    pass: {
      findUnique: (...a: unknown[]) => passFindUnique(...a),
      findMany: (...a: unknown[]) => passFindMany(...a),
      create: (...a: unknown[]) => passCreate(...a),
      update: (...a: unknown[]) => passUpdate(...a),
    },
  },
}));

const { createPass, updatePass, setPassStatus, archivePass, syncPassLifecycle, listPassesForEvent, getPass, PassValidationError } =
  await import("@/server/events/pass-service");
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
const basePass = {
  id: "pass1",
  eventId: "event1",
  name: "Full Pass",
  description: null,
  type: "FULL_PASS" as const,
  price: null,
  currency: null,
  quantity: null as number | null,
  soldQuantity: 0,
  salesStartAt: null as Date | null,
  salesEndAt: null as Date | null,
  validFrom: null as Date | null,
  validUntil: null as Date | null,
  status: "DRAFT" as const,
  sortOrder: 0,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  eventFindUnique.mockReset().mockResolvedValue(event);
  passFindUnique.mockReset().mockResolvedValue({ ...basePass, event });
  passFindMany.mockReset().mockResolvedValue([]);
  passCreate.mockReset().mockImplementation((args) => Promise.resolve({ ...basePass, ...args.data }));
  passUpdate.mockReset().mockImplementation((args) => Promise.resolve({ ...basePass, ...args.data }));
});

describe("createPass()", () => {
  it("чужое событие, не ADMIN — RegistrationForbiddenError, create не вызывается", async () => {
    eventFindUnique.mockResolvedValue({ id: "event1", createdById: "someone-else" });
    await expect(createPass("event1", owner, { name: "Full Pass", type: "FULL_PASS" })).rejects.toBeInstanceOf(RegistrationForbiddenError);
    expect(passCreate).not.toHaveBeenCalled();
  });

  it("событие не найдено — RegistrationNotFoundError", async () => {
    eventFindUnique.mockResolvedValue(null);
    await expect(createPass("missing", owner, { name: "Full Pass", type: "FULL_PASS" })).rejects.toBeInstanceOf(RegistrationNotFoundError);
  });

  it("пустое имя — PassValidationError, create не вызывается", async () => {
    await expect(createPass("event1", owner, { name: "   ", type: "FULL_PASS" })).rejects.toBeInstanceOf(PassValidationError);
    expect(passCreate).not.toHaveBeenCalled();
  });

  it("отрицательная цена — PassValidationError", async () => {
    await expect(createPass("event1", owner, { name: "VIP", type: "VIP_PASS", price: -10 })).rejects.toBeInstanceOf(PassValidationError);
  });

  it("нулевое/отрицательное quantity — PassValidationError", async () => {
    await expect(createPass("event1", owner, { name: "VIP", type: "VIP_PASS", quantity: 0 })).rejects.toBeInstanceOf(PassValidationError);
    await expect(createPass("event1", owner, { name: "VIP", type: "VIP_PASS", quantity: -5 })).rejects.toBeInstanceOf(PassValidationError);
  });

  it("дробное quantity — PassValidationError", async () => {
    await expect(createPass("event1", owner, { name: "VIP", type: "VIP_PASS", quantity: 1.5 })).rejects.toBeInstanceOf(PassValidationError);
  });

  it("salesStartAt позже salesEndAt — PassValidationError", async () => {
    await expect(
      createPass("event1", owner, {
        name: "VIP",
        type: "VIP_PASS",
        salesStartAt: new Date("2026-06-02"),
        salesEndAt: new Date("2026-06-01"),
      })
    ).rejects.toBeInstanceOf(PassValidationError);
  });

  it("validFrom позже validUntil — PassValidationError", async () => {
    await expect(
      createPass("event1", owner, {
        name: "VIP",
        type: "VIP_PASS",
        validFrom: new Date("2026-06-02"),
        validUntil: new Date("2026-06-01"),
      })
    ).rejects.toBeInstanceOf(PassValidationError);
  });

  it("владелец — создаёт Pass с триммированным именем и sortOrder по умолчанию 0", async () => {
    await createPass("event1", owner, { name: "  Full Pass  ", type: "FULL_PASS", price: 120, currency: "BYN", quantity: 50 });

    expect(passCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventId: "event1",
        name: "Full Pass",
        type: "FULL_PASS",
        price: 120,
        currency: "BYN",
        quantity: 50,
        sortOrder: 0,
      }),
    });
  });
});

describe("updatePass()", () => {
  it("нельзя опустить quantity ниже уже проданного количества", async () => {
    passFindUnique.mockResolvedValue({ ...basePass, quantity: 50, soldQuantity: 30, event });
    await expect(updatePass("pass1", owner, { quantity: 10 })).rejects.toBeInstanceOf(PassValidationError);
    expect(passUpdate).not.toHaveBeenCalled();
  });

  it("quantity равно soldQuantity — разрешено (граница, не строго меньше)", async () => {
    passFindUnique.mockResolvedValue({ ...basePass, quantity: 50, soldQuantity: 30, event });
    await updatePass("pass1", owner, { quantity: 30 });
    expect(passUpdate).toHaveBeenCalledWith({ where: { id: "pass1" }, data: expect.objectContaining({ quantity: 30 }) });
  });

  it("чужой Pass — RegistrationForbiddenError", async () => {
    passFindUnique.mockResolvedValue({ ...basePass, event: { id: "event1", createdById: "someone-else" } });
    await expect(updatePass("pass1", owner, { name: "New" })).rejects.toBeInstanceOf(RegistrationForbiddenError);
  });

  it("Pass не найден — RegistrationNotFoundError", async () => {
    passFindUnique.mockResolvedValue(null);
    await expect(updatePass("missing", owner, { name: "New" })).rejects.toBeInstanceOf(RegistrationNotFoundError);
  });
});

describe("setPassStatus()", () => {
  it("DRAFT/ACTIVE/PAUSED/ARCHIVED — разрешены", async () => {
    for (const status of ["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"] as const) {
      await setPassStatus("pass1", owner, status);
      expect(passUpdate).toHaveBeenCalledWith({ where: { id: "pass1" }, data: { status } });
    }
  });

  it("SOLD_OUT/ENDED — PassValidationError, нельзя назначить вручную", async () => {
    await expect(setPassStatus("pass1", owner, "SOLD_OUT")).rejects.toBeInstanceOf(PassValidationError);
    await expect(setPassStatus("pass1", owner, "ENDED")).rejects.toBeInstanceOf(PassValidationError);
    expect(passUpdate).not.toHaveBeenCalled();
  });

  it("archivePass() — эквивалент setPassStatus(ARCHIVED)", async () => {
    await archivePass("pass1", owner);
    expect(passUpdate).toHaveBeenCalledWith({ where: { id: "pass1" }, data: { status: "ARCHIVED" } });
  });
});

describe("syncPassLifecycle()", () => {
  it("ACTIVE + soldQuantity >= quantity — переключает в SOLD_OUT", async () => {
    const pass = { ...basePass, status: "ACTIVE" as const, quantity: 10, soldQuantity: 10 };
    passUpdate.mockResolvedValue({ ...pass, status: "SOLD_OUT" });

    const result = await syncPassLifecycle(pass);

    expect(passUpdate).toHaveBeenCalledWith({ where: { id: "pass1" }, data: { status: "SOLD_OUT" } });
    expect(result.status).toBe("SOLD_OUT");
  });

  it("ACTIVE + validUntil в прошлом — переключает в ENDED", async () => {
    const pass = { ...basePass, status: "ACTIVE" as const, validUntil: new Date(Date.now() - 1000) };
    passUpdate.mockResolvedValue({ ...pass, status: "ENDED" });

    const result = await syncPassLifecycle(pass);

    expect(passUpdate).toHaveBeenCalledWith({ where: { id: "pass1" }, data: { status: "ENDED" } });
    expect(result.status).toBe("ENDED");
  });

  it("SOLD_OUT + место освободилось (soldQuantity < quantity) — переключает обратно в ACTIVE", async () => {
    const pass = { ...basePass, status: "SOLD_OUT" as const, quantity: 10, soldQuantity: 9 };
    passUpdate.mockResolvedValue({ ...pass, status: "ACTIVE" });

    const result = await syncPassLifecycle(pass);

    expect(passUpdate).toHaveBeenCalledWith({ where: { id: "pass1" }, data: { status: "ACTIVE" } });
    expect(result.status).toBe("ACTIVE");
  });

  it("PAUSED — никогда не трогается автоматически, даже если формально распродан/просрочен", async () => {
    const pass = { ...basePass, status: "PAUSED" as const, quantity: 10, soldQuantity: 10, validUntil: new Date(Date.now() - 1000) };

    const result = await syncPassLifecycle(pass);

    expect(passUpdate).not.toHaveBeenCalled();
    expect(result).toBe(pass);
  });

  it("ARCHIVED/DRAFT — тоже не трогаются автоматически", async () => {
    await syncPassLifecycle({ ...basePass, status: "ARCHIVED" as const, quantity: 1, soldQuantity: 1 });
    await syncPassLifecycle({ ...basePass, status: "DRAFT" as const, quantity: 1, soldQuantity: 1 });
    expect(passUpdate).not.toHaveBeenCalled();
  });

  it("ничего не изменилось — no-op, update не вызывается", async () => {
    const pass = { ...basePass, status: "ACTIVE" as const, quantity: 10, soldQuantity: 5 };
    const result = await syncPassLifecycle(pass);
    expect(passUpdate).not.toHaveBeenCalled();
    expect(result).toBe(pass);
  });
});

describe("listPassesForEvent() / getPass() — availableQuantity", () => {
  it("quantity=null — availableQuantity=null (без ограничения)", async () => {
    passFindMany.mockResolvedValue([{ ...basePass, quantity: null, soldQuantity: 5 }]);
    const [result] = await listPassesForEvent("event1", owner);
    expect(result.availableQuantity).toBeNull();
  });

  it("quantity=50, soldQuantity=30 — availableQuantity=20", async () => {
    passFindMany.mockResolvedValue([{ ...basePass, quantity: 50, soldQuantity: 30 }]);
    const [result] = await listPassesForEvent("event1", owner);
    expect(result.availableQuantity).toBe(20);
  });

  it("availableQuantity никогда не уходит в минус", async () => {
    passFindMany.mockResolvedValue([{ ...basePass, quantity: 10, soldQuantity: 12 }]);
    const [result] = await listPassesForEvent("event1", owner);
    expect(result.availableQuantity).toBe(0);
  });

  it("чужое событие — RegistrationForbiddenError", async () => {
    eventFindUnique.mockResolvedValue({ id: "event1", createdById: "someone-else" });
    await expect(listPassesForEvent("event1", owner)).rejects.toBeInstanceOf(RegistrationForbiddenError);
  });

  it("getPass() — тот же расчёт для одного Pass", async () => {
    passFindUnique.mockResolvedValue({ ...basePass, quantity: 5, soldQuantity: 5, event });
    const result = await getPass("pass1", owner);
    expect(result.availableQuantity).toBe(0);
  });
});
