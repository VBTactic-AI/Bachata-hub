import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/server/rbac/actor";
import { can } from "@/server/rbac/authorize";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreateDivisionCategoryForm } from "@/components/admin/CreateDivisionCategoryForm";
import { ToggleCategoryActiveButton } from "@/components/admin/ToggleCategoryActiveButton";

export default async function DivisionCategoriesPage() {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (!can(actor, "division_category:manage")) redirect("/admin/competitions");

  const categories = await prisma.divisionCategory.findMany({ orderBy: { order: "asc" } });

  return (
    <div className="stack">
      <div>
        <h1 className="page-title">Категории соревнований</h1>
        <p className="page-subtitle">
          Общий справочник для всех соревнований. Организаторы выбирают дивизионы из этого списка — сами названия не
          придумывают. «Скрыть» не удаляет категорию, а просто убирает её из выбора для новых дивизионов; уже
          созданные дивизионы и регистрации не меняются.
        </p>
      </div>

      <div className="stack gap-3">
        {categories.map((c) => (
          <Card key={c.id} className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <strong>{c.name}</strong>
              {!c.isActive && (
                <span className="ml-2">
                  <Badge variant="pending">скрыта</Badge>
                </span>
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
