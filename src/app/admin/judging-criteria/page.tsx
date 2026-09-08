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
          <p className="m-0 mt-1 text-sm text-night-muted">
            Общий справочник критериев оценки финала — категории соревнований выбирают критерии отсюда, не вводят их с нуля.
          </p>
        </div>
        <AddButton label="Добавить показатель" gradientClassName="bg-gradient-admin-cta">
          <CreateJudgingCriterionForm />
        </AddButton>
      </div>

      <div className="rounded-app border border-night-border bg-night-card p-2 sm:p-3">
        <div className="grid grid-cols-[32px_1fr_auto] gap-3 px-3 pb-2 text-[0.68rem] font-semibold uppercase tracking-wide text-night-disabled sm:grid-cols-[48px_1fr_140px]">
          <span>#</span>
          <span>Название · диапазон</span>
          <span className="text-right">Видимость</span>
        </div>
        <JudgingCriterionList
          criteria={active.map((c) => ({ id: c.id, name: c.name, minScore: c.minScore, maxScore: c.maxScore, step: c.step, order: c.order }))}
        />
        {hidden.length > 0 && (
          <div className="mt-1 flex flex-col gap-0.5 border-t border-night-border pt-1">
            {hidden.map((c) => (
              <JudgingCriterionRow key={c.id} criterionId={c.id} name={c.name} minScore={c.minScore} maxScore={c.maxScore} />
            ))}
          </div>
        )}
      </div>

      <p className="m-0 text-xs leading-relaxed text-night-muted">
        Критерий из справочника выбирается на дивизионе (настройки финала) — выбор копирует название и диапазон в конкретную
        категорию соревнования, дальнейшая правка справочника не меняет уже выбранные критерии задним числом. «Скрыть» не
        удаляет критерий — просто убирает его из выбора для новых финалов; уже выбранные критерии не меняются.
      </p>
    </div>
  );
}
