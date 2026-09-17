import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireFestivalAccess } from "./festival-service";
import { getEventPassRevenue } from "./ticket-service";

// Festival Engine — Stage 2 (2026-09-17). «Бюджет» — доход считается из
// уже существующих данных (не задваивается со «Статистикой»): выручка по
// Pass на bridge-Event (getEventPassRevenue — уже существующая функция,
// доход по дочерним событиям не добавляется отдельно: там материализуются
// производные Ticket с price=null, см. комментарий у модели Ticket в
// schema.prisma) + денежные взносы спонсоров (решение пользователя,
// docs/FESTIVAL_SERVICE_LAYER_PLAN.md §2.2). Расходы — сумма
// FestivalExpense, вводится организатором вручную.

export type FestivalBudgetSummary = {
  passRevenue: number;
  sponsorIncome: number;
  totalIncome: number;
  totalExpenses: number;
  balance: number;
};

export async function getFestivalBudgetSummary(festivalId: string, user: User): Promise<FestivalBudgetSummary> {
  const festival = await requireFestivalAccess(festivalId, user);

  const [passRevenue, sponsorAgg, expenseAgg] = await Promise.all([
    festival.eventId ? getEventPassRevenue(festival.eventId, user) : Promise.resolve(0),
    prisma.festivalSponsor.aggregate({ where: { festivalId }, _sum: { amount: true } }),
    prisma.festivalExpense.aggregate({ where: { festivalId }, _sum: { amount: true } }),
  ]);

  const sponsorIncome = Number(sponsorAgg._sum.amount ?? 0);
  const totalExpenses = Number(expenseAgg._sum.amount ?? 0);
  const totalIncome = passRevenue + sponsorIncome;

  return {
    passRevenue,
    sponsorIncome,
    totalIncome,
    totalExpenses,
    balance: totalIncome - totalExpenses,
  };
}
