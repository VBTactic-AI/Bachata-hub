import type { FestivalExpense, FestivalExpenseCategory, FestivalExpenseStatus, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireFestivalAccess } from "./festival-service";
import { hasFestivalAccess } from "./access";
import { EventsValidationError, RegistrationForbiddenError, RegistrationNotFoundError } from "./registration-service";

// Festival Engine — Stage 2 (2026-09-17). Статьи расходов для вкладки
// «Бюджет» — доход считается отдельно, из уже существующих Ticket/Pass/
// FestivalSponsor (см. festival-budget-service.ts), здесь только расходы,
// которые организатор вводит вручную.

export class FestivalExpenseValidationError extends EventsValidationError {}

export type FestivalExpenseInput = {
  title: string;
  category: FestivalExpenseCategory;
  amount: number;
  currency?: string | null;
  status?: FestivalExpenseStatus;
  note?: string | null;
};

function validate(input: Partial<FestivalExpenseInput>): void {
  if (input.title !== undefined && !input.title.trim()) {
    throw new FestivalExpenseValidationError("title_required", "Название статьи расходов обязательно.");
  }
  if (input.amount != null && input.amount < 0) {
    throw new FestivalExpenseValidationError("invalid_amount", "Сумма не может быть отрицательной.");
  }
}

export async function createFestivalExpense(festivalId: string, user: User, input: FestivalExpenseInput): Promise<FestivalExpense> {
  await requireFestivalAccess(festivalId, user);
  validate(input);

  return prisma.festivalExpense.create({
    data: {
      festivalId,
      title: input.title.trim(),
      category: input.category,
      amount: input.amount,
      currency: input.currency?.trim() || null,
      status: input.status ?? "PENDING",
      note: input.note?.trim() || null,
    },
  });
}

async function requireAccessForExpense(expenseId: string, user: User) {
  const expense = await prisma.festivalExpense.findUnique({ where: { id: expenseId }, include: { festival: true } });
  if (!expense) throw new RegistrationNotFoundError();
  if (!(await hasFestivalAccess(expense.festival, user))) throw new RegistrationForbiddenError("forbidden");
  return expense;
}

export async function updateFestivalExpense(
  expenseId: string,
  user: User,
  patch: Partial<FestivalExpenseInput>
): Promise<FestivalExpense> {
  await requireAccessForExpense(expenseId, user);
  validate(patch);

  return prisma.festivalExpense.update({
    where: { id: expenseId },
    data: {
      ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
      ...(patch.category !== undefined ? { category: patch.category } : {}),
      ...(patch.amount !== undefined ? { amount: patch.amount } : {}),
      ...(patch.currency !== undefined ? { currency: patch.currency?.trim() || null } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.note !== undefined ? { note: patch.note?.trim() || null } : {}),
    },
  });
}

export async function deleteFestivalExpense(expenseId: string, user: User): Promise<void> {
  await requireAccessForExpense(expenseId, user);
  await prisma.festivalExpense.delete({ where: { id: expenseId } });
}

export async function listFestivalExpenses(festivalId: string, user: User): Promise<FestivalExpense[]> {
  await requireFestivalAccess(festivalId, user);
  return prisma.festivalExpense.findMany({ where: { festivalId }, orderBy: { createdAt: "desc" } });
}
