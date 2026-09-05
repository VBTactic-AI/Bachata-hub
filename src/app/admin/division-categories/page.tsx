import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/server/rbac/actor";
import { can } from "@/server/rbac/authorize";
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
          <p className="m-0 mt-1 text-sm text-night-muted">Порядок отображения категорий</p>
        </div>
        <AddButton label="Добавить категорию" gradientClassName="bg-gradient-night-cta">
          <CreateDivisionCategoryForm />
        </AddButton>
      </div>

      <div className="rounded-app border border-night-border bg-night-card p-2 sm:p-3">
        <div className="grid grid-cols-[32px_1fr_auto] gap-3 px-3 pb-2 text-[0.68rem] font-semibold uppercase tracking-wide text-night-disabled sm:grid-cols-[48px_1fr_140px]">
          <span>#</span>
          <span>Название</span>
          <span className="text-right">Видимость</span>
        </div>
        <div className="flex flex-col gap-0.5">
          {active.map((c) => (
            <CategoryRow key={c.id} categoryId={c.id} name={c.name} order={c.order} isActive />
          ))}
          {hidden.map((c) => (
            <CategoryRow key={c.id} categoryId={c.id} name={c.name} order={c.order} isActive={false} />
          ))}
        </div>
      </div>

      <p className="m-0 text-xs leading-relaxed text-night-muted">
        Организаторы выбирают дивизионы из этого списка — сами названия не придумывают. «Скрыть» не удаляет
        категорию, а просто убирает её из выбора для новых дивизионов; уже созданные дивизионы и регистрации не
        меняются. Порядок определяет иерархию уровней (по нему движок ищет «категорию выше» для помощников при
        жеребьёвке) — чем больше число, тем «выше» категория.
      </p>
    </div>
  );
}
