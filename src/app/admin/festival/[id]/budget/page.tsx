import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getFestivalBudgetSummary } from "@/server/events/festival-budget-service";
import { listFestivalExpenses } from "@/server/events/festival-expense-service";
import { RegistrationForbiddenError, RegistrationNotFoundError } from "@/server/events/registration-service";
import { StatCard } from "@/components/admin/StatCard";
import { CardIcon, CheckCircleIcon, AlertIcon, TargetIcon } from "@/components/admin/icons";
import { FestivalExpenseManager } from "@/components/admin/festival/FestivalExpenseManager";

// Вкладка «Бюджет» — Stage UI-4, продолжение Stage 2 сервисного слоя
// (festival-budget-service.ts). Доход — агрегат из уже показанных на других
// вкладках Pass/спонсорских данных (ничего не задваивается со
// «Статистикой»), здесь только сводка + расходы, которые организатор вводит
// вручную.
export default async function FestivalBudgetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  let summary, expenses;
  try {
    [summary, expenses] = await Promise.all([getFestivalBudgetSummary(id, user), listFestivalExpenses(id, user)]);
  } catch (e) {
    if (e instanceof RegistrationForbiddenError) redirect("/admin/festival");
    if (e instanceof RegistrationNotFoundError) notFound();
    throw e;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Доход" value={`${summary.totalIncome} BYN`} icon={<CheckCircleIcon />} tone="success" />
        <StatCard label="из них Pass" value={`${summary.passRevenue} BYN`} icon={<CardIcon />} tone="primary" />
        <StatCard label="из них спонсоры" value={`${summary.sponsorIncome} BYN`} icon={<CardIcon />} tone="primary" />
        <StatCard label="Расходы" value={`${summary.totalExpenses} BYN`} icon={<AlertIcon />} tone="danger" />
      </div>

      <div className="rounded-app border border-admin-border bg-admin-card p-4">
        <div className="flex items-center gap-2">
          <TargetIcon />
          <span className="text-sm font-semibold uppercase tracking-wide text-admin-muted">Баланс</span>
        </div>
        <p className={`m-0 mt-2 text-2xl font-extrabold ${summary.balance >= 0 ? "text-night-success" : "text-red-400"}`}>
          {summary.balance} BYN
        </p>
      </div>

      <FestivalExpenseManager
        festivalId={id}
        expenses={expenses.map((e) => ({
          id: e.id,
          title: e.title,
          category: e.category,
          amount: Number(e.amount),
          currency: e.currency,
          status: e.status,
          note: e.note,
        }))}
      />
    </div>
  );
}
