import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/server/rbac/actor";
import { can } from "@/server/rbac/authorize";
import { RoundStageTimeline } from "@/components/admin/RoundStageTimeline";
import { HiddenSection } from "@/components/admin/HiddenSection";
import { AddButton } from "@/components/admin/AddButton";
import { CreateRoundStageForm } from "@/components/admin/CreateRoundStageForm";
import { ToggleRoundStageActiveButton } from "@/components/admin/ToggleRoundStageActiveButton";

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
          <p className="m-0 mt-1 text-sm text-night-muted">Настройте этапы и порядок</p>
        </div>
        <AddButton label="Добавить этап" gradientClassName="bg-gradient-night-violet">
          <CreateRoundStageForm />
        </AddButton>
      </div>

      <RoundStageTimeline stages={active} />

      <HiddenSection count={hidden.length}>
        {hidden.map((s) => (
          <div key={s.id} className="flex items-center gap-3 rounded-app bg-night-card p-3">
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-night-muted">{s.name}</span>
            <span className="shrink-0 text-xs text-night-muted">{s.defaultAdvanceCount}</span>
            <ToggleRoundStageActiveButton stageId={s.id} isActive={s.isActive} />
          </div>
        ))}
      </HiddenSection>

      <p className="m-0 text-xs leading-relaxed text-night-muted">
        Общий справочник для всех соревнований. Организаторы выбирают раунды из этого списка, а не придумывают
        названия сами. «Сколько проходит дальше» — число по умолчанию, при создании конкретного раунда его можно
        поправить под размер дивизиона. «Скрыть» не удаляет этап, а просто убирает его из выбора для новых раундов;
        уже созданные раунды не меняются.
      </p>
    </div>
  );
}
