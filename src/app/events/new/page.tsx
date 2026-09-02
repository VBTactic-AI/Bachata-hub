import { redirect } from "next/navigation";
import { getCurrentUser, canCreateEvents } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { t } from "@/lib/i18n/dictionary";
import { AddEventForm } from "@/components/AddEventForm";

export default async function NewEventPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canCreateEvents(user)) redirect("/");

  const [cities, ownedSchools] = await Promise.all([
    prisma.city.findMany({ where: { isActive: true }, orderBy: { nameRu: "asc" } }),
    user.role === "SCHOOL_REP"
      ? prisma.school.findMany({ where: { ownerUserId: user.id }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
  ]);

  return (
    <div className="stack">
      <h1 className="page-title">{t.event.addEventForm.title}</h1>
      <AddEventForm cities={cities} ownedSchools={ownedSchools} />
    </div>
  );
}
