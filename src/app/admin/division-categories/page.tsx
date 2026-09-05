import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/server/rbac/actor";
import { can } from "@/server/rbac/authorize";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreateDivisionCategoryForm } from "@/components/admin/CreateDivisionCategoryForm";
import { EditDivisionCategoryForm } from "@/components/admin/EditDivisionCategoryForm";
import { ToggleCategoryActiveButton } from "@/components/admin/ToggleCategoryActiveButton";

export default async function DivisionCategoriesPage() {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (!can(actor, "division_category:manage")) redirect("/admin/competitions");

  const categories = await prisma.divisionCategory.findMany({ orderBy: { order: "asc" } });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="m-0 font-night text-xl font-extrabold text-night-text sm:text-3xl">Категории соревнований</h1>
        <p className="m-0 mt-2 text-sm leading-relaxed text-night-muted">
          Общий справочник для всех соревнований. Организаторы выбирают дивизионы из этого списка — сами названия не
          придумывают. «Скрыть» не удаляет категорию, а просто убирает её из выбора для новых дивизионов; уже
          созданные дивизионы и регистрации не меняются. Порядок определяет иерархию уровней (по нему движок ищет
          "категорию выше" для помощников при жеребьёвке) — чем больше число, тем "выше" категория; можно поправить
          в любой момент.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {categories.map((c) => (
          <Card key={c.id} className="flex flex-wrap items-center justify-between gap-2 border-night-border bg-night-card">
            <div className="flex flex-wrap items-center gap-2">
              <EditDivisionCategoryForm categoryId={c.id} name={c.name} order={c.order} />
              {!c.isActive && (
                <Badge variant="pending" className="bg-night-card2 text-night-muted">
                  скрыта
                </Badge>
              )}
            </div>
            <ToggleCategoryActiveButton categoryId={c.id} isActive={c.isActive} />
          </Card>
        ))}
      </div>

      <CreateDivisionCategoryForm />
    </div>
  );
}
