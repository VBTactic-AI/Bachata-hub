import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/server/rbac/actor";
import { can } from "@/server/rbac/authorize";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreateRoundStageForm } from "@/components/admin/CreateRoundStageForm";
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
          этап, а просто убирает его из выбора для новых раундов; уже созданные раунды не меняются.
        </p>
      </div>

      <div className="stack gap-3">
        {stages.map((s) => (
          <Card key={s.id} className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <strong>{s.name}</strong>
              <span className="hint-text ml-2">проходят {s.defaultAdvanceCount}</span>
              {!s.isActive && (
                <span className="ml-2">
                  <Badge variant="pending">скрыт</Badge>
                </span>
              )}
            </div>
            <ToggleRoundStageActiveButton stageId={s.id} isActive={s.isActive} />
          </Card>
        ))}
      </div>

      <CreateRoundStageForm />
    </div>
  );
}
