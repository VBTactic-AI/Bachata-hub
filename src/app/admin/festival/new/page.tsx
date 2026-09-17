import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FestivalCreateForm } from "@/components/admin/festival/FestivalCreateForm";

export default async function NewFestivalPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isVerifiedFestivalOrganizer && !isAdmin(user)) redirect("/admin");

  const cities = await prisma.city.findMany({ where: { isActive: true }, orderBy: { nameRu: "asc" }, select: { id: true, nameRu: true } });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="m-0 font-night text-xl font-extrabold text-night-text sm:text-2xl">Создать фестиваль</h1>
      <FestivalCreateForm cities={cities} />
    </div>
  );
}
