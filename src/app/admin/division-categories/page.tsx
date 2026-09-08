import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/server/rbac/actor";
import { can } from "@/server/rbac/authorize";
import { CategoryList } from "@/components/admin/CategoryList";
import { CategoryRow } from "@/components/admin/CategoryRow";
import { AddButton } from "@/components/admin/AddButton";
import { CreateDivisionCategoryForm } from "@/components/admin/CreateDivisionCategoryForm";

export default async function DivisionCategoriesPage() {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (!can(actor, "division_category:manage")) redirect("/admin/competitions");

  const categories = await prisma.divisionCategory.findMany({ orderBy: { order: "asc" } });
  const active = categories.filter((c) => c.isActive);
  const hidden = categories.filter((c) => !c.isActive);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="m-0 font-night text-xl font-extrabold text-night-text sm:text-2xl">Категории соревнований</h1>
          <p className="m-0 mt-1 text-sm text-admin-muted">Порядок отображения категорий</p>
        </div>
        <AddButton label="Добавить категорию" gradientClassName="bg-gradient-admin-cta">
          <CreateDivisionCategoryForm />
        </AddButton>
      </div>

      <div className="overflow-x-auto rounded-app border border-admin-border bg-admin-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-admin-card2 text-xs font-semibold uppercase tracking-wide text-admin-disabled">
            <tr>
              <th className="px-3 py-2.5 font-semibold">№</th>
              <th className="px-3 py-2.5 font-semibold">Название</th>
              <th className="px-3 py-2.5 font-semibold">Статус</th>
              <th className="px-3 py-2.5 text-right font-semibold">Действия</th>
            </tr>
          </thead>
          <tbody>
            <CategoryList categories={active.map((c) => ({ id: c.id, name: c.name, order: c.order }))} />
            {hidden.map((c) => (
              <CategoryRow key={c.id} categoryId={c.id} name={c.name} />
            ))}
          </tbody>
        </table>
      </div>

      <p className="m-0 text-xs leading-relaxed text-admin-muted">
        Организаторы выбирают категории из этого списка — сами названия не придумывают. «Скрыть» не удаляет
        саму категорию, а лишь убирает её из выбора при добавлении в новое соревнование; уже добавленные
        категории и регистрации не меняются. Порядок определяет иерархию уровней (по нему движок ищет «категорию выше» для помощников при
        жеребьёвке) — перетащите строку за ⠿, чтобы изменить порядок.
      </p>
    </div>
  );
}
