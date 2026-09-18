import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listTeamMembers } from "@/server/events/team-service";
import { RegistrationForbiddenError } from "@/server/events/registration-service";
import { EventTeamManager } from "@/components/admin/events/EventTeamManager";

// Вкладка «Команда» — Festival НЕ заводит собственную FestivalTeamMember
// (docs/FESTIVAL_ENGINE_ER.md, "вне скоупа") — доступ команды идёт через
// EventTeamMember уже существующего bridge-Event. RBAC там — тот же
// requireOwnerOrAdmin(eventId, user), что и isOwnerOrAdminFestival
// (bridgeEvent.createdById = festival.createdById при создании, см.
// createFestivalPass) — поэтому переиспользуем уже готовый
// EventTeamManager/listTeamMembers один в один, ничего фестиваль-специфичного
// здесь нет, кроме "нечего показывать, пока bridge не появился".
export default async function FestivalTeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const festival = await prisma.festival.findUnique({ where: { id }, select: { eventId: true } });
  if (!festival) notFound();

  if (!festival.eventId) {
    return (
      <div className="rounded-app border border-admin-border bg-admin-card p-4">
        <p className="m-0 text-sm text-admin-muted">
          Пригласить соредакторов можно после создания первого Pass — до этого фестиваль виден только вам.
        </p>
      </div>
    );
  }

  const bridgeEvent = await prisma.event.findUnique({ where: { id: festival.eventId }, select: { id: true, slug: true } });
  if (!bridgeEvent) notFound();

  let members;
  try {
    members = await listTeamMembers(bridgeEvent.id, user);
  } catch (e) {
    if (e instanceof RegistrationForbiddenError) redirect("/admin/festival");
    throw e;
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-sm text-admin-muted">
        Люди, которым вы дали доступ к управлению этим фестивалем. Владелец фестиваля всегда вы сами.
      </p>

      <EventTeamManager
        eventSlug={bridgeEvent.slug}
        initialMembers={members.map((m) => ({
          id: m.id,
          role: m.role,
          user: { id: m.user.id, email: m.user.email, displayName: m.user.dancer?.displayName ?? null },
        }))}
      />
    </div>
  );
}
