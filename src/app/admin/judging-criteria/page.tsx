import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/server/rbac/actor";
import { can } from "@/server/rbac/authorize";
import { JudgingCriterionList } from "@/components/admin/JudgingCriterionList";
import { JudgingCriterionRow } from "@/components/admin/JudgingCriterionRow";
import { AddButton } from "@/components/admin/AddButton";
import { CreateJudgingCriterionForm } from "@/components/admin/CreateJudgingCriterionForm";

export default async function JudgingCriteriaPage() {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (!can(actor, "judging_criteria:manage")) redirect("/admin/competitions");

  const criteria = await prisma.judgingCriterionCatalog.findMany({ orderBy: { order: "asc" } });
  const active = criteria.filter((c) => c.isActive);
  const hidden = criteria.filter((c) => !c.isActive);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="m-0 font-night text-xl font-extrabold text-night-text sm:text-2xl">Оценочные показатели</h1>
          <p className="m-0 mt-1 text-sm text-admin-muted">
            Общий справочник критериев оценки финала — категории соревнований выбирают критерии отсюда, не вводят их с нуля.
          </p>
        </div>
        <AddButton label="Добавить показатель" gradientClassName="bg-gradient-admin-cta">
          <CreateJudgingCriterionForm />
        </AddButton>
      </div>

      <div className="overflow-x-auto rounded-app border border-admin-border bg-admin-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-admin-card2 text-xs font-semibold uppercase tracking-wide text-admin-disabled">
            <tr>
              <th className="px-3 py-2.5 font-semibold">№</th>
              <th className="px-3 py-2.5 font-semibold">Показатель</th>
              <th className="px-3 py-2.5 font-semibold">Диапазон оценок</th>
              <th className="px-3 py-2.5 font-semibold">Статус</th>
              <th className="px-3 py-2.5 text-right font-semibold">Действия</th>
            </tr>
          </thead>
          <tbody>
            <JudgingCriterionList
              criteria={active.map((c) => ({ id: c.id, name: c.name, minScore: c.minScore, maxScore: c.maxScore, step: c.step, order: c.order }))}
            />
            {hidden.map((c) => (
              <JudgingCriterionRow key={c.id} criterionId={c.id} name={c.name} minScore={c.minScore} maxScore={c.maxScore} />
            ))}
          </tbody>
        </table>
      </div>

      <p className="m-0 text-xs leading-relaxed text-admin-muted">
        Критерий из справочника выбирается на дивизионе (настройки финала) — выбор копирует название и диапазон в конкретную
        категорию соревнования, дальнейшая правка справочника не меняет уже выбранные критерии задним числом. «Скрыть» не
        удаляет критерий — просто убирает его из выбора для новых финалов; уже выбранные критерии не меняются.
      </p>
    </div>
  );
}
