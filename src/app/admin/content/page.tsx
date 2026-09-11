import { redirect } from "next/navigation";
import { getCurrentUser, canCreateEvents } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { t } from "@/lib/i18n/dictionary";
import { AddEventForm } from "@/components/admin/AddEventForm";

// Перенесено из /events/new (2026-09-11, по прямому запросу пользователя) —
// кнопка "Добавить событие" убрана из общесайтовой навигации (Header/
// DarkTopNav) и живёт здесь, под вкладкой "Контент" в /admin. Права те же,
// что и были — canCreateEvents (SCHOOL_REP/ORGANIZER/MODERATOR/ADMIN), не
// isAdmin: сужать состав тех, кто может добавить событие, никто не просил.
export default async function AdminContentPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canCreateEvents(user)) redirect("/admin");

  const [cities, ownedSchools] = await Promise.all([
    prisma.city.findMany({ where: { isActive: true }, orderBy: { nameRu: "asc" } }),
    user.role === "SCHOOL_REP"
      ? prisma.school.findMany({ where: { ownerUserId: user.id }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="m-0 font-night text-xl font-extrabold text-night-text sm:text-2xl">Контент</h1>
        <p className="m-0 mt-1 text-sm text-admin-muted">{t.event.addEventForm.title}</p>
      </div>
      <AddEventForm cities={cities} ownedSchools={ownedSchools} />
    </div>
  );
}
