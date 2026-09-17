import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listProgramItems } from "@/server/events/program-item-service";
import { RegistrationForbiddenError, RegistrationNotFoundError } from "@/server/events/registration-service";
import { ProgramItemManager, type ProgramItemRow } from "@/components/admin/festival/ProgramItemManager";

// Вкладка «Программа» — доступ уже проверен в layout.tsx (hasFestivalAccess
// через getFestivalForEdit), listProgramItems делает ту же проверку заново
// (defense-in-depth, CLAUDE.md §31 — вызывается и напрямую через API).
export default async function FestivalProgramPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  let items;
  try {
    items = await listProgramItems(id, user);
  } catch (e) {
    if (e instanceof RegistrationForbiddenError) redirect("/admin/festival");
    if (e instanceof RegistrationNotFoundError) notFound();
    throw e;
  }

  const teacherIds = items.map((i) => i.teacherId).filter((v): v is string => v != null);
  const [teachers, myEvents, itemTeachers] = await Promise.all([
    prisma.teacher.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, school: { select: { name: true } } },
    }),
    // Дочерние события — только свои же (организатор не может привязать
    // чужое событие к своей программе).
    prisma.event.findMany({ where: { createdById: user.id }, orderBy: { title: "asc" }, select: { id: true, title: true } }),
    teacherIds.length === 0
      ? Promise.resolve([])
      : prisma.teacher.findMany({ where: { id: { in: teacherIds } }, select: { id: true, name: true } }),
  ]);

  const teacherNameById = new Map(itemTeachers.map((t) => [t.id, t.name]));

  const rows: ProgramItemRow[] = items.map((item) => ({
    id: item.id,
    title: item.title,
    type: item.type,
    startTime: item.startTime.toISOString(),
    endTime: item.endTime ? item.endTime.toISOString() : null,
    teacherId: item.teacherId,
    linkedEventId: item.linkedEventId,
    capacity: item.capacity,
    showCapacityPublicly: item.showCapacityPublicly,
    teacherName: item.teacherId ? (teacherNameById.get(item.teacherId) ?? null) : null,
  }));

  const teacherOptions = teachers.map((t) => ({ id: t.id, label: t.school ? `${t.name} (${t.school.name})` : t.name }));
  const linkedEventOptions = myEvents.map((e) => ({ id: e.id, title: e.title || "Без названия" }));

  return (
    <div className="flex flex-col gap-4">
      <ProgramItemManager festivalId={id} items={rows} teachers={teacherOptions} linkedEventOptions={linkedEventOptions} />
    </div>
  );
}
