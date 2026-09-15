import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listTeamMembers } from "@/server/events/team-service";
import { RegistrationForbiddenError } from "@/server/events/registration-service";
import { EventTeamManager } from "@/components/admin/events/EventTeamManager";

// Events Engine, этап 5 — вкладка "Команда". Управлять составом (добавлять/
// убирать) может только владелец события/ADMIN — listTeamMembers сам это
// проверяет (RegistrationForbiddenError -> редирект).
export default async function EventTeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const event = await prisma.event.findUnique({ where: { id }, select: { id: true, slug: true, title: true } });
  if (!event) notFound();

  let members;
  try {
    members = await listTeamMembers(event.id, user);
  } catch (e) {
    if (e instanceof RegistrationForbiddenError) redirect("/admin/content");
    throw e;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* §12 ТЗ — заголовок/бейджи/breadcrumb события теперь общие для всех
          вкладок, рендерятся один раз в layout.tsx рядом. */}
      <p className="m-0 text-sm text-admin-muted">
        Люди, которым вы дали доступ к управлению этим событием (просмотр и статус участников). Владелец события всегда вы сами.
      </p>

      <EventTeamManager
        eventSlug={event.slug}
        initialMembers={members.map((m) => ({ id: m.id, role: m.role, user: { id: m.user.id, email: m.user.email } }))}
      />
    </div>
  );
}
