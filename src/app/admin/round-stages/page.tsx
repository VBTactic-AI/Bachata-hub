import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/server/rbac/actor";
import { can } from "@/server/rbac/authorize";
import { RoundStageRow } from "@/components/admin/RoundStageRow";
import { RoundStageList } from "@/components/admin/RoundStageList";
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
          <p className="m-0 mt-1 text-sm text-admin-muted">Раунды и их последовательность</p>
        </div>
        <AddButton label="Добавить этап" gradientClassName="bg-gradient-admin-cta">
          <CreateRoundStageForm />
        </AddButton>
      </div>

      <div className="overflow-x-auto rounded-app border border-admin-border bg-admin-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-admin-card2 text-xs font-semibold uppercase tracking-wide text-admin-disabled">
            <tr>
              <th className="px-3 py-2.5 font-semibold">№</th>
              <th className="px-3 py-2.5 font-semibold">Этап</th>
              <th className="px-3 py-2.5 font-semibold">Количество мест (по умолчанию)</th>
              <th className="px-3 py-2.5 font-semibold">Статус</th>
              <th className="px-3 py-2.5 text-right font-semibold">Действия</th>
            </tr>
          </thead>
          <tbody>
            <RoundStageList stages={active.map((s, i) => ({ id: s.id, name: s.name, defaultAdvanceCount: s.defaultAdvanceCount, order: i + 1 }))} />
            {hidden.map((s) => (
              <RoundStageRow key={s.id} stageId={s.id} name={s.name} defaultAdvanceCount={s.defaultAdvanceCount} />
            ))}
          </tbody>
        </table>
      </div>

      <p className="m-0 text-xs leading-relaxed text-admin-muted">
        Общий справочник для всех соревнований. Организаторы выбирают раунды из этого списка, а не придумывают
        названия сами. «Количество мест (по умолчанию)» — число по умолчанию, при создании конкретного раунда его
        можно поправить под размер категории. «Скрыть» не удаляет этап, а просто убирает его из выбора для новых
        раундов; уже созданные раунды не меняются. Порядок — перетащите строку за ⠿.
      </p>
    </div>
  );
}
