import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FestivalCreateWizard } from "@/components/admin/festival/FestivalCreateWizard";

export default async function NewFestivalPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isVerifiedFestivalOrganizer && !isAdmin(user)) redirect("/admin");

  // teachers/linkedEventOptions — те же данные, что и на вкладке «Программа»
  // (program/page.tsx), нужны здесь для шага 2 мастера (ProgramItemFormModal).
  const [cities, teachers, myEvents] = await Promise.all([
    prisma.city.findMany({ where: { isActive: true }, orderBy: { nameRu: "asc" }, select: { id: true, nameRu: true } }),
    prisma.teacher.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, school: { select: { name: true } } } }),
    prisma.event.findMany({ where: { createdById: user.id }, orderBy: { title: "asc" }, select: { id: true, title: true } }),
  ]);

  const teacherOptions = teachers.map((t) => ({ id: t.id, label: t.school ? `${t.name} (${t.school.name})` : t.name }));
  const linkedEventOptions = myEvents.map((e) => ({ id: e.id, title: e.title || "Без названия" }));

  return (
    <div className="flex flex-col gap-4">
      <h1 className="m-0 font-night text-xl font-extrabold text-night-text sm:text-2xl">Создать фестиваль</h1>
      <FestivalCreateWizard cities={cities} teachers={teacherOptions} linkedEventOptions={linkedEventOptions} />
    </div>
  );
}
