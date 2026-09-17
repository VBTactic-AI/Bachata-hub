import { describe, it, expect, vi, beforeEach } from "vitest";
import type { User } from "@prisma/client";

const festivalFindUnique = vi.fn();
const expenseFindUnique = vi.fn();
const expenseFindMany = vi.fn();
const expenseCreate = vi.fn();
const expenseUpdate = vi.fn();
const expenseDelete = vi.fn();
const eventTeamMemberFindUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    festival: { findUnique: (...a: unknown[]) => festivalFindUnique(...a) },
    festivalExpense: {
      findUnique: (...a: unknown[]) => expenseFindUnique(...a),
      findMany: (...a: unknown[]) => expenseFindMany(...a),
      create: (...a: unknown[]) => expenseCreate(...a),
      update: (...a: unknown[]) => expenseUpdate(...a),
      delete: (...a: unknown[]) => expenseDelete(...a),
    },
    eventTeamMember: { findUnique: (...a: unknown[]) => eventTeamMemberFindUnique(...a) },
  },
}));

const {
  createFestivalExpense,
  updateFestivalExpense,
  deleteFestivalExpense,
  listFestivalExpenses,
  FestivalExpenseValidationError,
} = await import("@/server/events/festival-expense-service");
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
const baseExpense = {
  id: "exp1",
  festivalId: "fest1",
  title: "Гонорары артистов",
  category: "ARTISTS" as const,
  amount: 3200,
  currency: "BYN",
  status: "PENDING" as const,
  note: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  festivalFindUnique.mockResolvedValue({ ...baseFestival });
  expenseFindUnique.mockResolvedValue({ ...baseExpense, festival: { ...baseFestival } });
  expenseCreate.mockImplementation((args) => Promise.resolve({ ...baseExpense, ...args.data }));
  expenseUpdate.mockImplementation((args) => Promise.resolve({ ...baseExpense, ...args.data }));
  eventTeamMemberFindUnique.mockResolvedValue(null);
});

describe("createFestivalExpense()", () => {
  it("постороннему запрещено", async () => {
    await expect(
      createFestivalExpense("fest1", stranger, { title: "X", category: "OTHER", amount: 100 })
    ).rejects.toBeInstanceOf(RegistrationForbiddenError);
  });

  it("требует непустое название", async () => {
    await expect(createFestivalExpense("fest1", owner, { title: " ", category: "OTHER", amount: 100 })).rejects.toBeInstanceOf(
      FestivalExpenseValidationError
    );
  });

  it("сумма не может быть отрицательной", async () => {
    await expect(createFestivalExpense("fest1", owner, { title: "X", category: "OTHER", amount: -1 })).rejects.toBeInstanceOf(
      FestivalExpenseValidationError
    );
  });

  it("создаёт статью расходов, статус по умолчанию PENDING", async () => {
    await createFestivalExpense("fest1", owner, { title: "Реклама", category: "MARKETING", amount: 850 });
    expect(expenseCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ festivalId: "fest1", status: "PENDING", amount: 850 }) })
    );
  });
});

describe("updateFestivalExpense() / deleteFestivalExpense()", () => {
  it("постороннему запрещено", async () => {
    await expect(updateFestivalExpense("exp1", stranger, { status: "PAID" })).rejects.toBeInstanceOf(RegistrationForbiddenError);
    await expect(deleteFestivalExpense("exp1", stranger)).rejects.toBeInstanceOf(RegistrationForbiddenError);
  });

  it("владелец меняет статус на Оплачено", async () => {
    await updateFestivalExpense("exp1", owner, { status: "PAID" });
    expect(expenseUpdate).toHaveBeenCalledWith({ where: { id: "exp1" }, data: { status: "PAID" } });
  });

  it("владелец удаляет статью", async () => {
    await deleteFestivalExpense("exp1", owner);
    expect(expenseDelete).toHaveBeenCalledWith({ where: { id: "exp1" } });
  });
});

describe("listFestivalExpenses()", () => {
  it("сортирует по дате создания (новые сверху)", async () => {
    expenseFindMany.mockResolvedValue([baseExpense]);
    const result = await listFestivalExpenses("fest1", owner);
    expect(expenseFindMany).toHaveBeenCalledWith({ where: { festivalId: "fest1" }, orderBy: { createdAt: "desc" } });
    expect(result).toHaveLength(1);
  });
});
