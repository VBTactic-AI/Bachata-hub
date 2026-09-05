import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/server/rbac/actor";
import { can } from "@/server/rbac/authorize";
import { CategoryCard } from "@/components/admin/CategoryCard";
import { HiddenSection } from "@/components/admin/HiddenSection";
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
          <p className="m-0 mt-1 text-sm text-night-muted">Управляйте категориями</p>
        </div>
        <AddButton label="Добавить" gradientClassName="bg-gradient-night-cta">
          <CreateDivisionCategoryForm />
        </AddButton>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {active.map((c, i) => (
          <CategoryCard key={c.id} categoryId={c.id} name={c.name} order={c.order} isActive iconIndex={i} />
        ))}
      </div>

      <HiddenSection count={hidden.length}>
        {hidden.map((c, i) => (
          <CategoryCard key={c.id} categoryId={c.id} name={c.name} order={c.order} isActive={false} iconIndex={active.length + i} compact />
        ))}
      </HiddenSection>

      <p className="m-0 text-xs leading-relaxed text-night-muted">
        Организаторы выбирают дивизионы из этого списка — сами названия не придумывают. «Скрыть» не удаляет
        категорию, а просто убирает её из выбора для новых дивизионов; уже созданные дивизионы и регистрации не
        меняются. Порядок определяет иерархию уровней (по нему движок ищет «категорию выше» для помощников при
        жеребьёвке) — чем больше число, тем «выше» категория.
      </p>
    </div>
  );
}
