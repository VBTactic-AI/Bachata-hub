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

  const marginPct = summary.totalIncome > 0 ? Math.round((summary.balance / summary.totalIncome) * 100) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Доход" value={`${summary.totalIncome} BYN`} icon={<CheckCircleIcon />} tone="success" valueTone="success" />
        <StatCard label="Расходы" value={`${summary.totalExpenses} BYN`} icon={<AlertIcon />} tone="danger" valueTone="danger" />
        <StatCard
          label="Баланс"
          value={`${summary.balance >= 0 ? "+" : ""}${summary.balance} BYN`}
          icon={<TargetIcon />}
          tone={summary.balance >= 0 ? "success" : "danger"}
          valueTone={summary.balance >= 0 ? "success" : "danger"}
        />
        <StatCard label="Маржа" value={marginPct == null ? "—" : `${marginPct}%`} icon={<CardIcon />} tone="primary" />
      </div>

      <div className="rounded-app border border-admin-border bg-admin-card p-4">
        <h2 className="m-0 mb-3 text-sm font-semibold uppercase tracking-wide text-admin-muted">Доход — из чего складывается</h2>
        <div className="flex flex-col">
          <div className="flex items-center justify-between border-b border-admin-border py-2 text-sm last:border-none">
            <span className="text-night-text">🎫 Продажа пассов</span>
            <span className="font-bold tabular-nums text-night-success">{summary.passRevenue} BYN</span>
          </div>
          <div className="flex items-center justify-between py-2 text-sm">
            <span className="text-night-text">🤝 Спонсорские взносы</span>
            <span className="font-bold tabular-nums text-night-success">{summary.sponsorIncome} BYN</span>
          </div>
        </div>
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
