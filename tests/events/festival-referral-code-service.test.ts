import { describe, it, expect, vi, beforeEach } from "vitest";
import type { User } from "@prisma/client";

// Festival Engine — Stage 4 (2026-09-17, docs/FESTIVAL_SERVICE_LAYER_PLAN.md).
// Реферальные коды артистов/школ — CRUD-поверхность зеркалит PromoCode
// (create/list/setActive, без произвольного update и без физического
// удаления — см. комментарий в festival-referral-code-service.ts).

const festivalFindUnique = vi.fn();
const codeFindUnique = vi.fn();
const codeFindMany = vi.fn();
const codeCreate = vi.fn();
const codeUpdate = vi.fn();
const ticketAggregate = vi.fn();
const eventTeamMemberFindUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    festival: { findUnique: (...a: unknown[]) => festivalFindUnique(...a) },
    festivalReferralCode: {
      findUnique: (...a: unknown[]) => codeFindUnique(...a),
      findMany: (...a: unknown[]) => codeFindMany(...a),
      create: (...a: unknown[]) => codeCreate(...a),
      update: (...a: unknown[]) => codeUpdate(...a),
    },
    ticket: { aggregate: (...a: unknown[]) => ticketAggregate(...a) },
    eventTeamMember: { findUnique: (...a: unknown[]) => eventTeamMemberFindUnique(...a) },
  },
}));

const {
  createReferralCode,
  setReferralCodeActive,
  listReferralCodesForFestival,
  getReferralCodeStats,
  isReferralCodeCurrentlyActive,
  FestivalReferralCodeValidationError,
} = await import("@/server/events/festival-referral-code-service");
const { RegistrationForbiddenError, RegistrationNotFoundError } = await import("@/server/events/registration-service");

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "user1",
    email: "user1@example.com",
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
  } as User;
}

const owner = makeUser({ id: "owner1" });
const stranger = makeUser({ id: "stranger1" });
const baseFestival = { id: "fest1", createdById: "owner1", eventId: null as string | null };
const baseCode = {
  id: "code1",
  festivalId: "fest1",
  code: "TEACHER10",
  ownerTeacherId: "teacher1",
  ownerSchoolId: null,
  discountType: "PERCENT" as const,
  discountValue: 10,
  commissionType: "PERCENT" as const,
  commissionValue: 15,
  active: true,
  startsAt: null,
  expiresAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  festivalFindUnique.mockResolvedValue({ ...baseFestival });
  codeFindUnique.mockResolvedValue({ ...baseCode, festival: { ...baseFestival } });
  codeCreate.mockImplementation((args) => Promise.resolve({ ...baseCode, ...args.data }));
  codeUpdate.mockImplementation((args) => Promise.resolve({ ...baseCode, ...args.data }));
  ticketAggregate.mockResolvedValue({ _count: { _all: 0 }, _sum: { referralDiscountAmount: null, referralCommissionAmount: null } });
  eventTeamMemberFindUnique.mockResolvedValue(null);
});

describe("createReferralCode()", () => {
  const validInput = {
    code: "teacher10",
    owner: { ownerTeacherId: "teacher1" } as const,
    discountType: "PERCENT" as const,
    discountValue: 10,
    commissionType: "PERCENT" as const,
    commissionValue: 15,
  };

  it("постороннему запрещено", async () => {
    await expect(createReferralCode("fest1", stranger, validInput)).rejects.toBeInstanceOf(RegistrationForbiddenError);
  });

  it("фестиваль не найден", async () => {
    festivalFindUnique.mockResolvedValue(null);
    await expect(createReferralCode("missing", owner, validInput)).rejects.toBeInstanceOf(RegistrationNotFoundError);
  });

  it("код обязателен", async () => {
    await expect(createReferralCode("fest1", owner, { ...validInput, code: "  " })).rejects.toBeInstanceOf(
      FestivalReferralCodeValidationError
    );
  });

  it("ни одного владельца — ошибка", async () => {
    await expect(createReferralCode("fest1", owner, { ...validInput, owner: {} as never })).rejects.toMatchObject({
      code: "owner_required",
    });
  });

  it("оба владельца сразу — ошибка (ровно один)", async () => {
    await expect(
      createReferralCode("fest1", owner, { ...validInput, owner: { ownerTeacherId: "t1", ownerSchoolId: "s1" } as never })
    ).rejects.toMatchObject({ code: "owner_required" });
  });

  it("владелец — школа, без discount — код чистой атрибуции без скидки", async () => {
    await createReferralCode("fest1", owner, {
      code: "SCHOOL5",
      owner: { ownerSchoolId: "school1" },
      commissionType: "FIXED_AMOUNT",
      commissionValue: 20,
    });
    expect(codeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ ownerSchoolId: "school1", ownerTeacherId: null, discountType: null, discountValue: null }),
      })
    );
  });

  it("discountType без discountValue — ошибка (не по чему интерпретировать)", async () => {
    await expect(
      createReferralCode("fest1", owner, { ...validInput, discountType: "PERCENT", discountValue: undefined })
    ).rejects.toMatchObject({ code: "invalid_discount_pair" });
  });

  it("discountValue без discountType — ошибка", async () => {
    await expect(
      createReferralCode("fest1", owner, { ...validInput, discountType: undefined, discountValue: 10 })
    ).rejects.toMatchObject({ code: "invalid_discount_pair" });
  });

  it("скидка в процентах > 100 — ошибка", async () => {
    await expect(
      createReferralCode("fest1", owner, { ...validInput, discountType: "PERCENT", discountValue: 150 })
    ).rejects.toMatchObject({ code: "invalid_discount_percent" });
  });

  it("комиссия <= 0 — ошибка", async () => {
    await expect(createReferralCode("fest1", owner, { ...validInput, commissionValue: 0 })).rejects.toMatchObject({
      code: "invalid_commission_value",
    });
  });

  it("комиссия в процентах > 100 — ошибка", async () => {
    await expect(
      createReferralCode("fest1", owner, { ...validInput, commissionType: "PERCENT", commissionValue: 101 })
    ).rejects.toMatchObject({ code: "invalid_commission_percent" });
  });

  it("startsAt позже expiresAt — ошибка", async () => {
    await expect(
      createReferralCode("fest1", owner, { ...validInput, startsAt: new Date("2027-01-10"), expiresAt: new Date("2027-01-01") })
    ).rejects.toMatchObject({ code: "invalid_window" });
  });

  it("код нормализуется в верхний регистр", async () => {
    await createReferralCode("fest1", owner, validInput);
    expect(codeCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ code: "TEACHER10" }) }));
  });

  it("дубликат кода в пределах фестиваля (P2002) — понятная ошибка", async () => {
    codeCreate.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));
    await expect(createReferralCode("fest1", owner, validInput)).rejects.toMatchObject({ code: "duplicate_referral_code" });
  });
});

describe("setReferralCodeActive()", () => {
  it("постороннему запрещено", async () => {
    await expect(setReferralCodeActive("code1", stranger, false)).rejects.toBeInstanceOf(RegistrationForbiddenError);
  });

  it("код не найден", async () => {
    codeFindUnique.mockResolvedValue(null);
    await expect(setReferralCodeActive("missing", owner, false)).rejects.toBeInstanceOf(RegistrationNotFoundError);
  });

  it("владелец деактивирует код", async () => {
    await setReferralCodeActive("code1", owner, false);
    expect(codeUpdate).toHaveBeenCalledWith({ where: { id: "code1" }, data: { active: false } });
  });
});

describe("listReferralCodesForFestival()", () => {
  it("сортирует по дате создания (новые сверху)", async () => {
    codeFindMany.mockResolvedValue([baseCode]);
    const result = await listReferralCodesForFestival("fest1", owner);
    expect(codeFindMany).toHaveBeenCalledWith({ where: { festivalId: "fest1" }, orderBy: { createdAt: "desc" } });
    expect(result).toHaveLength(1);
  });
});

describe("getReferralCodeStats()", () => {
  it("постороннему запрещено", async () => {
    await expect(getReferralCodeStats("code1", stranger)).rejects.toBeInstanceOf(RegistrationForbiddenError);
  });

  it("считает только оплаченные ISSUED билеты этого кода", async () => {
    ticketAggregate.mockResolvedValue({ _count: { _all: 4 }, _sum: { referralDiscountAmount: 40, referralCommissionAmount: 60 } });
    const result = await getReferralCodeStats("code1", owner);
    expect(ticketAggregate).toHaveBeenCalledWith({
      where: { referralCodeId: "code1", status: "ISSUED", isPaid: true },
      _count: { _all: true },
      _sum: { referralDiscountAmount: true, referralCommissionAmount: true },
    });
    expect(result).toEqual({ ticketCount: 4, totalDiscountAmount: 40, totalCommissionAmount: 60 });
  });

  it("нет билетов — нулевые агрегаты, не null", async () => {
    const result = await getReferralCodeStats("code1", owner);
    expect(result).toEqual({ ticketCount: 0, totalDiscountAmount: 0, totalCommissionAmount: 0 });
  });
});

describe("isReferralCodeCurrentlyActive()", () => {
  const now = new Date("2027-06-15T12:00:00Z");

  it("active=false — недействителен независимо от дат", () => {
    expect(isReferralCodeCurrentlyActive({ active: false, startsAt: null, expiresAt: null }, now)).toBe(false);
  });

  it("startsAt в будущем — ещё не действует", () => {
    expect(isReferralCodeCurrentlyActive({ active: true, startsAt: new Date("2027-07-01"), expiresAt: null }, now)).toBe(false);
  });

  it("expiresAt в прошлом — уже истёк", () => {
    expect(isReferralCodeCurrentlyActive({ active: true, startsAt: null, expiresAt: new Date("2027-01-01") }, now)).toBe(false);
  });

  it("active + в пределах окна (или без окна) — действителен", () => {
    expect(isReferralCodeCurrentlyActive({ active: true, startsAt: null, expiresAt: null }, now)).toBe(true);
    expect(
      isReferralCodeCurrentlyActive({ active: true, startsAt: new Date("2027-01-01"), expiresAt: new Date("2027-12-31") }, now)
    ).toBe(true);
  });
});
