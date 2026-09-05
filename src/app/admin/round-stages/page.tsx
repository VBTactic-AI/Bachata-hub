import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/server/rbac/actor";
import { can } from "@/server/rbac/authorize";
import { RoundStageRow } from "@/components/admin/RoundStageRow";
import { AddButton } from "@/components/admin/AddButton";
import { CreateRoundStageForm } from "@/components/admin/CreateRoundStageForm";

export default async function RoundStagesPage() {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (!can(actor, "round_stage:manage")) redirect("/admin/competitions");

  const stages = await prisma.roundStageCatalog.findMany({ orderBy: { order: "asc" } });
  const active = stages.filter((s) => s.isActive);
  const hidden = stages.filter((s) => !s.isActive);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="m-0 font-night text-xl font-extrabold text-night-text sm:text-2xl">Этапы отбора</h1>
          <p className="m-0 mt-1 text-sm text-night-muted">Раунды и их последовательность</p>
        </div>
        <AddButton label="Добавить этап" gradientClassName="bg-gradient-night-cta">
          <CreateRoundStageForm />
        </AddButton>
      </div>

      <div className="rounded-app border border-night-border bg-night-card p-2 sm:p-3">
        <div className="grid grid-cols-[32px_1fr_auto] gap-3 px-3 pb-2 text-[0.68rem] font-semibold uppercase tracking-wide text-night-disabled sm:grid-cols-[48px_1fr_140px]">
          <span>#</span>
          <span>Название этапа</span>
          <span className="text-right">Проходит дальше</span>
        </div>
        <div className="flex flex-col gap-0.5">
          {active.map((s, i) => (
            <RoundStageRow key={s.id} stageId={s.id} name={s.name} defaultAdvanceCount={s.defaultAdvanceCount} isActive order={i + 1} />
          ))}
          {hidden.map((s) => (
            <RoundStageRow key={s.id} stageId={s.id} name={s.name} defaultAdvanceCount={s.defaultAdvanceCount} isActive={false} order={null} />
          ))}
        </div>
      </div>

      <p className="m-0 text-xs leading-relaxed text-night-muted">
        Общий справочник для всех соревнований. Организаторы выбирают раунды из этого списка, а не придумывают
        названия сами. «Сколько проходит дальше» — число по умолчанию, при создании конкретного раунда его можно
        поправить под размер дивизиона. «Скрыть» не удаляет этап, а просто убирает его из выбора для новых раундов;
        уже созданные раунды не меняются.
      </p>
    </div>
  );
}
