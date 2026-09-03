import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/server/rbac/actor";
import { can } from "@/server/rbac/authorize";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreateRoundStageForm } from "@/components/admin/CreateRoundStageForm";
import { EditRoundStageForm } from "@/components/admin/EditRoundStageForm";
import { ToggleRoundStageActiveButton } from "@/components/admin/ToggleRoundStageActiveButton";

export default async function RoundStagesPage() {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (!can(actor, "round_stage:manage")) redirect("/admin/competitions");

  const stages = await prisma.roundStageCatalog.findMany({ orderBy: { order: "asc" } });

  return (
    <div className="stack">
      <div>
        <h1 className="page-title">Этапы отбора</h1>
        <p className="page-subtitle">
          Общий справочник для всех соревнований (Отборочный, Четвертьфинал, Полуфинал, Финал...). Организаторы
          выбирают раунды из этого списка, а не придумывают названия сами. «Сколько проходит дальше» — число по
          умолчанию, при создании конкретного раунда его можно поправить под размер дивизиона. «Скрыть» не удаляет
          этап, а просто убирает его из выбора для новых раундов; уже созданные раунды не меняются. Название и число
          можно поправить в любой момент — уже созданный раунд хранит своё число отдельно и не пересчитывается
          задним числом, меняется только подпись для новых раундов.
        </p>
      </div>

      <div className="stack gap-3">
        {stages.map((s) => (
          <Card key={s.id} className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <EditRoundStageForm stageId={s.id} name={s.name} defaultAdvanceCount={s.defaultAdvanceCount} />
              {!s.isActive && <Badge variant="pending">скрыт</Badge>}
            </div>
            <ToggleRoundStageActiveButton stageId={s.id} isActive={s.isActive} />
          </Card>
        ))}
      </div>

      <CreateRoundStageForm />
    </div>
  );
}
