import { describe, it, expect, vi, beforeEach } from "vitest";
import type { User } from "@prisma/client";

// Ticket Engine (2026-09-16) — Pass CRUD. Создание/редактирование/статус —
// только владелец события/ADMIN (isOwnerOrAdmin, синхронная проверка), тот
// же принцип, что и team-service.ts. Чтение списка (listPassesForEvent/
// getPass) — hasEventAccess (любой член команды, им нужно видеть Pass, чтобы
// выдавать билеты), поэтому eventTeamMember тоже замокан.

const eventFindUnique = vi.fn();
const passFindUnique = vi.fn();
const passFindMany = vi.fn();
const passCreate = vi.fn();
const passUpdate = vi.fn();
const passDelete = vi.fn();
const ticketCount = vi.fn();
const eventTeamMemberFindUnique = vi.fn();
const passPriceTierFindMany = vi.fn();
const passPriceTierCreate = vi.fn();
const passPriceTierUpdate = vi.fn();
const passPriceTierDelete = vi.fn();
const passPriceTierFindUnique = vi.fn();
const passAccessGrantFindMany = vi.fn();
const txPassAccessGrantDeleteMany = vi.fn();
const txPassAccessGrantCreateMany = vi.fn();
const txPassAccessGrantFindMany = vi.fn();
const promoCodeCreate = vi.fn();
const promoCodeFindMany = vi.fn();
const promoCodeFindUnique = vi.fn();
const promoCodeUpdate = vi.fn();
// Commerce Engine v1 (2026-09-17) — createPass() создаёт Product рядом с
// Pass в одной транзакции (см. комментарий в pass-service.ts).
const productCreate = vi.fn();

const fakeTx = {
  pass: { create: (...a: unknown[]) => passCreate(...a) },
  product: { create: (...a: unknown[]) => productCreate(...a) },
  passAccessGrant: { deleteMany: txPassAccessGrantDeleteMany, createMany: txPassAccessGrantCreateMany, findMany: txPassAccessGrantFindMany },
};

vi.mock("@/lib/prisma", () => ({
  prisma: {
    event: { findUnique: (...a: unknown[]) => eventFindUnique(...a) },
    pass: {
      findUnique: (...a: unknown[]) => passFindUnique(...a),
      findMany: (...a: unknown[]) => passFindMany(...a),
      create: (...a: unknown[]) => passCreate(...a),
      update: (...a: unknown[]) => passUpdate(...a),
      delete: (...a: unknown[]) => passDelete(...a),
    },
    passPriceTier: {
      findMany: (...a: unknown[]) => passPriceTierFindMany(...a),
      create: (...a: unknown[]) => passPriceTierCreate(...a),
      update: (...a: unknown[]) => passPriceTierUpdate(...a),
      delete: (...a: unknown[]) => passPriceTierDelete(...a),
      findUnique: (...a: unknown[]) => passPriceTierFindUnique(...a),
    },
    passAccessGrant: { findMany: (...a: unknown[]) => passAccessGrantFindMany(...a) },
    ticket: { count: (...a: unknown[]) => ticketCount(...a) },
    promoCode: {
      create: (...a: unknown[]) => promoCodeCreate(...a),
      findMany: (...a: unknown[]) => promoCodeFindMany(...a),
      findUnique: (...a: unknown[]) => promoCodeFindUnique(...a),
      update: (...a: unknown[]) => promoCodeUpdate(...a),
    },
    eventTeamMember: { findUnique: (...a: unknown[]) => eventTeamMemberFindUnique(...a) },
    $transaction: (fn: (tx: typeof fakeTx) => unknown) => fn(fakeTx),
  },
}));

const {
  createPass,
  updatePass,
  setPassStatus,
  archivePass,
  syncPassLifecycle,
  listPassesForEvent,
  listPublicPassesForEvent,
  getPass,
  createPriceTier,
  updatePriceTier,
  deletePriceTier,
  deletePass,
  getCurrentPassPrice,
  setAccessGrants,
  createPromoCode,
  setPromoCodeActive,
  deriveRefundFields,
  validateRefundPolicy,
  PassValidationError,
} = await import("@/server/events/pass-service");
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
  imageUrl: null,
  allowMultipleEntry: true,
  refundPolicy: "NONE" as const,
  refundDeadline: null as Date | null,
  refundFeePercent: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  eventFindUnique.mockReset().mockResolvedValue(event);
  passFindUnique.mockReset().mockResolvedValue({ ...basePass, event });
  passFindMany.mockReset().mockResolvedValue([]);
  passCreate.mockReset().mockImplementation((args) => Promise.resolve({ ...basePass, ...args.data }));
  passUpdate.mockReset().mockImplementation((args) => Promise.resolve({ ...basePass, ...args.data }));
  passDelete.mockReset().mockResolvedValue({});
  ticketCount.mockReset().mockResolvedValue(0);
  eventTeamMemberFindUnique.mockReset().mockResolvedValue(null);
  passPriceTierFindMany.mockReset().mockResolvedValue([]);
  passPriceTierCreate.mockReset().mockImplementation((args) => Promise.resolve({ id: "tier1", ...args.data }));
  passPriceTierUpdate.mockReset().mockImplementation((args) => Promise.resolve({ id: "tier1", ...args.data }));
  passPriceTierDelete.mockReset().mockResolvedValue({});
  passPriceTierFindUnique.mockReset();
  passAccessGrantFindMany.mockReset().mockResolvedValue([]);
  txPassAccessGrantDeleteMany.mockReset().mockResolvedValue({ count: 0 });
  txPassAccessGrantCreateMany.mockReset().mockResolvedValue({ count: 0 });
  txPassAccessGrantFindMany.mockReset().mockResolvedValue([]);
  promoCodeCreate.mockReset().mockImplementation((args) => Promise.resolve({ id: "promo1", ...args.data }));
  promoCodeFindMany.mockReset().mockResolvedValue([]);
  promoCodeFindUnique.mockReset();
  promoCodeUpdate.mockReset().mockImplementation((args) => Promise.resolve({ id: "promo1", ...args.data }));
  productCreate.mockReset().mockImplementation((args) => Promise.resolve({ id: "product1", ...args.data }));
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

  it("refundPolicy не передан — дефолт NONE, deadline/feePercent не заданы", async () => {
    await createPass("event1", owner, { name: "Full Pass", type: "FULL_PASS" });
    expect(passCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ refundPolicy: "NONE", refundDeadline: null, refundFeePercent: null }),
    });
  });

  it("refundPolicy=UNTIL_DATE без refundDeadline — PassValidationError", async () => {
    await expect(createPass("event1", owner, { name: "VIP", type: "VIP_PASS", refundPolicy: "UNTIL_DATE" })).rejects.toMatchObject({
      code: "refund_deadline_required",
    });
    expect(passCreate).not.toHaveBeenCalled();
  });

  it("refundPolicy=UNTIL_DATE с датой — сохраняется, feePercent игнорируется (null)", async () => {
    const deadline = new Date("2027-01-01");
    await createPass("event1", owner, {
      name: "VIP",
      type: "VIP_PASS",
      refundPolicy: "UNTIL_DATE",
      refundDeadline: deadline,
      refundFeePercent: 50, // не относится к UNTIL_DATE — должен быть отброшен
    });
    expect(passCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ refundPolicy: "UNTIL_DATE", refundDeadline: deadline, refundFeePercent: null }),
    });
  });

  it("refundPolicy=PARTIAL без refundFeePercent — PassValidationError", async () => {
    await expect(createPass("event1", owner, { name: "VIP", type: "VIP_PASS", refundPolicy: "PARTIAL" })).rejects.toMatchObject({
      code: "refund_fee_required",
    });
  });

  it("refundPolicy=PARTIAL с feePercent=0 — тоже ошибка (нужен положительный размер)", async () => {
    await expect(
      createPass("event1", owner, { name: "VIP", type: "VIP_PASS", refundPolicy: "PARTIAL", refundFeePercent: 0 })
    ).rejects.toMatchObject({ code: "refund_fee_required" });
  });

  it("refundFeePercent > 100 — PassValidationError, независимо от политики", async () => {
    await expect(
      createPass("event1", owner, { name: "VIP", type: "VIP_PASS", refundPolicy: "PARTIAL", refundFeePercent: 150 })
    ).rejects.toMatchObject({ code: "invalid_refund_fee_percent" });
  });

  it("refundPolicy=FULL — deadline/feePercent игнорируются, даже если переданы", async () => {
    await createPass("event1", owner, {
      name: "VIP",
      type: "VIP_PASS",
      refundPolicy: "FULL",
      refundDeadline: new Date("2027-01-01"),
      refundFeePercent: 10,
    });
    expect(passCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ refundPolicy: "FULL", refundDeadline: null, refundFeePercent: null }),
    });
  });
});

describe("deriveRefundFields() / validateRefundPolicy() — условия возврата (Stage 7 Festival Engine, 2026-09-17)", () => {
  it("пустой input — NONE без deadline/feePercent", () => {
    expect(deriveRefundFields({})).toEqual({ refundPolicy: "NONE", refundDeadline: null, refundFeePercent: null });
  });

  it("validateRefundPolicy принимает валидные комбинации", () => {
    expect(() => validateRefundPolicy({ refundPolicy: "NONE", refundDeadline: null, refundFeePercent: null })).not.toThrow();
    expect(() =>
      validateRefundPolicy({ refundPolicy: "UNTIL_DATE", refundDeadline: new Date(), refundFeePercent: null })
    ).not.toThrow();
    expect(() => validateRefundPolicy({ refundPolicy: "PARTIAL", refundDeadline: null, refundFeePercent: 25 })).not.toThrow();
    expect(() => validateRefundPolicy({ refundPolicy: "FULL", refundDeadline: null, refundFeePercent: null })).not.toThrow();
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

describe("listPublicPassesForEvent() — Stage UI-5, без RBAC", () => {
  it("не требует пользователя, фильтрует только ACTIVE/SOLD_OUT", async () => {
    passFindMany.mockResolvedValue([{ ...basePass, status: "ACTIVE" }]);
    const result = await listPublicPassesForEvent("event1");
    expect(passFindMany).toHaveBeenCalledWith({
      where: { eventId: "event1", status: { in: ["ACTIVE", "SOLD_OUT"] } },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    expect(result).toHaveLength(1);
    expect(eventFindUnique).not.toHaveBeenCalled();
  });
});

describe("createPriceTier() / updatePriceTier() / getCurrentPassPrice() — Early Bird (2026-09-16)", () => {
  it("пустое название периода — PassValidationError", async () => {
    await expect(createPriceTier("pass1", owner, { label: "  ", price: 100 })).rejects.toBeInstanceOf(PassValidationError);
  });

  it("отрицательная цена периода — PassValidationError", async () => {
    await expect(createPriceTier("pass1", owner, { label: "Early Bird", price: -10 })).rejects.toBeInstanceOf(PassValidationError);
  });

  it("окно нового периода пересекается с уже существующим — PassValidationError", async () => {
    passPriceTierFindMany.mockResolvedValue([
      { id: "existing", validFrom: new Date("2026-06-01"), validUntil: new Date("2026-06-10") },
    ]);
    await expect(
      createPriceTier("pass1", owner, { label: "Regular", price: 150, validFrom: new Date("2026-06-05"), validUntil: new Date("2026-06-15") })
    ).rejects.toBeInstanceOf(PassValidationError);
    expect(passPriceTierCreate).not.toHaveBeenCalled();
  });

  it("окна не пересекаются (соседние периоды) — создаётся без ошибки", async () => {
    passPriceTierFindMany.mockResolvedValue([{ id: "existing", validFrom: null, validUntil: new Date("2026-06-01") }]);
    await createPriceTier("pass1", owner, { label: "Regular", price: 150, validFrom: new Date("2026-06-01"), validUntil: null });
    expect(passPriceTierCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ passId: "pass1", label: "Regular", price: 150 }),
    });
  });

  it("updatePriceTier() — чужое событие — RegistrationForbiddenError", async () => {
    passPriceTierFindUnique.mockResolvedValue({
      id: "tier1",
      passId: "pass1",
      validFrom: null,
      validUntil: null,
      pass: { event: { id: "event1", createdById: "someone-else" } },
    });
    await expect(updatePriceTier("tier1", owner, { price: 90 })).rejects.toBeInstanceOf(RegistrationForbiddenError);
  });

  it("deletePriceTier() — удаляет тир (чистая конфигурация, не история продаж)", async () => {
    passPriceTierFindUnique.mockResolvedValue({
      id: "tier1",
      passId: "pass1",
      pass: { event },
    });
    await deletePriceTier("tier1", owner);
    expect(passPriceTierDelete).toHaveBeenCalledWith({ where: { id: "tier1" } });
  });

  it("getCurrentPassPrice() — нет тиров — базовая цена Pass", () => {
    const result = getCurrentPassPrice({ price: 100, currency: "BYN" }, []);
    expect(result).toEqual({ price: 100, currency: "BYN" });
  });

  it("getCurrentPassPrice() — активный тир (сейчас внутри окна) перекрывает базовую цену", () => {
    const now = new Date("2026-06-05");
    const tiers = [
      { id: "t1", sortOrder: 0, price: 100 as unknown as number, currency: "BYN", validFrom: new Date("2026-06-01"), validUntil: new Date("2026-06-10") },
    ];
    const result = getCurrentPassPrice({ price: 150, currency: "BYN" }, tiers as never, now);
    expect(result).toEqual({ price: 100, currency: "BYN" });
  });

  it("getCurrentPassPrice() — тир вне окна (уже закончился) — базовая цена", () => {
    const now = new Date("2026-07-01");
    const tiers = [{ id: "t1", sortOrder: 0, price: 100 as unknown as number, currency: "BYN", validFrom: new Date("2026-06-01"), validUntil: new Date("2026-06-10") }];
    const result = getCurrentPassPrice({ price: 150, currency: "BYN" }, tiers as never, now);
    expect(result).toEqual({ price: 150, currency: "BYN" });
  });

  it("getCurrentPassPrice() — несколько кандидатов (не должно быть после валидации, но на всякий случай) — берёт больший sortOrder", () => {
    const now = new Date("2026-06-05");
    const tiers = [
      { id: "t1", sortOrder: 0, price: 100 as unknown as number, currency: "BYN", validFrom: null, validUntil: null },
      { id: "t2", sortOrder: 1, price: 130 as unknown as number, currency: "BYN", validFrom: null, validUntil: null },
    ];
    const result = getCurrentPassPrice({ price: 150, currency: "BYN" }, tiers as never, now);
    expect(result).toEqual({ price: 130, currency: "BYN" });
  });
});

describe("setAccessGrants() / listAccessGrants() — доступ к пунктам программы/сессиям (2026-09-16)", () => {
  it("чужое событие — RegistrationForbiddenError, транзакция не запускается", async () => {
    passFindUnique.mockResolvedValue({ ...basePass, event: { id: "event1", createdById: "someone-else" } });
    await expect(setAccessGrants("pass1", owner, [{ programItemId: "item1" }])).rejects.toBeInstanceOf(RegistrationForbiddenError);
    expect(txPassAccessGrantDeleteMany).not.toHaveBeenCalled();
  });

  it("пустой список — полностью снимает ограничения (Pass = доступ ко всему)", async () => {
    const result = await setAccessGrants("pass1", owner, []);
    expect(txPassAccessGrantDeleteMany).toHaveBeenCalledWith({ where: { passId: "pass1" } });
    expect(txPassAccessGrantCreateMany).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it("заменяет весь список грантов — сначала удаляет старые, потом создаёт новые", async () => {
    await setAccessGrants("pass1", owner, [{ programItemId: "item1" }, { masterclassSessionId: "session1" }]);
    expect(txPassAccessGrantDeleteMany).toHaveBeenCalledWith({ where: { passId: "pass1" } });
    expect(txPassAccessGrantCreateMany).toHaveBeenCalledWith({
      data: [
        { passId: "pass1", programItemId: "item1", masterclassSessionId: null },
        { passId: "pass1", programItemId: null, masterclassSessionId: "session1" },
      ],
    });
  });
});

describe("createPromoCode() / setPromoCodeActive() — только схема + CRUD (2026-09-16)", () => {
  it("пустой код — PassValidationError", async () => {
    await expect(createPromoCode("event1", owner, { code: "  ", discountType: "PERCENT", discountValue: 20 })).rejects.toBeInstanceOf(
      PassValidationError
    );
  });

  it("скидка <= 0 — PassValidationError", async () => {
    await expect(createPromoCode("event1", owner, { code: "X", discountType: "PERCENT", discountValue: 0 })).rejects.toBeInstanceOf(
      PassValidationError
    );
  });

  it("процентная скидка больше 100 — PassValidationError", async () => {
    await expect(createPromoCode("event1", owner, { code: "X", discountType: "PERCENT", discountValue: 150 })).rejects.toBeInstanceOf(
      PassValidationError
    );
  });

  it("код приводится к верхнему регистру и триммится", async () => {
    await createPromoCode("event1", owner, { code: " bachata20 ", discountType: "PERCENT", discountValue: 20 });
    expect(promoCodeCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ code: "BACHATA20" }) });
  });

  it("дублирующийся код в том же событии (P2002) — PassValidationError('duplicate_promo_code')", async () => {
    promoCodeCreate.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));
    await expect(createPromoCode("event1", owner, { code: "X", discountType: "FIXED_AMOUNT", discountValue: 50 })).rejects.toMatchObject({
      code: "duplicate_promo_code",
    });
  });

  it("чужое событие — RegistrationForbiddenError", async () => {
    eventFindUnique.mockResolvedValue({ id: "event1", createdById: "someone-else" });
    await expect(createPromoCode("event1", owner, { code: "X", discountType: "PERCENT", discountValue: 10 })).rejects.toBeInstanceOf(
      RegistrationForbiddenError
    );
  });

  it("setPromoCodeActive() — деактивирует код", async () => {
    promoCodeFindUnique.mockResolvedValue({ id: "promo1", event });
    await setPromoCodeActive("promo1", owner, false);
    expect(promoCodeUpdate).toHaveBeenCalledWith({ where: { id: "promo1" }, data: { isActive: false } });
  });
});

describe("deletePass() — настоящее удаление (2026-09-16, по прямому запросу пользователя)", () => {
  it("ни одного Ticket не выдавалось — удаляет физически", async () => {
    passFindUnique.mockResolvedValue({ ...basePass, soldQuantity: 0, event });
    ticketCount.mockResolvedValue(0);
    await deletePass("pass1", owner);
    expect(ticketCount).toHaveBeenCalledWith({ where: { passId: "pass1" } });
    expect(passDelete).toHaveBeenCalledWith({ where: { id: "pass1" } });
  });

  it("есть выданные билеты — PassValidationError('pass_has_sales'), delete не вызывается", async () => {
    passFindUnique.mockResolvedValue({ ...basePass, soldQuantity: 3, event });
    ticketCount.mockResolvedValue(3);
    await expect(deletePass("pass1", owner)).rejects.toMatchObject({ code: "pass_has_sales" });
    expect(passDelete).not.toHaveBeenCalled();
  });

  it("soldQuantity === 0, но есть отменённый в прошлом Ticket (аудит) — всё равно блокируется, не падает 500", async () => {
    // Регрессия: cancelTicket/refundTicket уменьшают soldQuantity обратно,
    // но сам Ticket не удаляется — проверка обязана смотреть на реальное
    // наличие строк Ticket, а не на soldQuantity (найдено вживую при QA).
    passFindUnique.mockResolvedValue({ ...basePass, soldQuantity: 0, event });
    ticketCount.mockResolvedValue(1);
    await expect(deletePass("pass1", owner)).rejects.toMatchObject({ code: "pass_has_sales" });
    expect(passDelete).not.toHaveBeenCalled();
  });

  it("чужой Pass — RegistrationForbiddenError", async () => {
    passFindUnique.mockResolvedValue({ ...basePass, soldQuantity: 0, event: { id: "event1", createdById: "someone-else" } });
    await expect(deletePass("pass1", owner)).rejects.toBeInstanceOf(RegistrationForbiddenError);
    expect(passDelete).not.toHaveBeenCalled();
  });

  it("Pass не найден — RegistrationNotFoundError", async () => {
    passFindUnique.mockResolvedValue(null);
    await expect(deletePass("missing", owner)).rejects.toBeInstanceOf(RegistrationNotFoundError);
  });
});
