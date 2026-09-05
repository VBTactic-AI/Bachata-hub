import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/server/rbac/actor";
import { can } from "@/server/rbac/authorize";
import { CreateCompetitionForm } from "@/components/admin/CreateCompetitionForm";

export default async function NewCompetitionPage() {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (!can(actor, "competition:create")) redirect("/admin/competitions");

  const cities = await prisma.city.findMany({ where: { isActive: true }, orderBy: { nameRu: "asc" } });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="m-0 font-night text-xl font-extrabold text-night-text sm:text-3xl">Новое соревнование</h1>
      <CreateCompetitionForm cities={cities} />
    </div>
  );
}
