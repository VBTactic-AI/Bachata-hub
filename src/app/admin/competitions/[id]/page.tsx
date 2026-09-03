import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/server/rbac/actor";
import { can } from "@/server/rbac/authorize";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AddDivisionForm } from "@/components/admin/AddDivisionForm";
import { CompetitionStatusControls } from "@/components/admin/CompetitionStatusControls";
import { RegisterSelfForm } from "@/components/admin/RegisterSelfForm";
import { AdminRegisterForm } from "@/components/admin/AdminRegisterForm";
import { CheckInButton } from "@/components/admin/CheckInButton";
import { RoleOverrideReview } from "@/components/admin/RoleOverrideReview";
import { suggestedRoleForGender } from "@/server/competition/register-competitor";
import {
  COMPETITION_STATUS_LABELS as STATUS_LABELS,
  DIVISION_LEVEL_LABELS,
  REGISTRATION_ROLE_LABELS as ROLE_LABELS,
  REGISTRATION_STATUS_LABELS,
} from "@/lib/competition-labels";

export default async function CompetitionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getActor();
  if (!actor) redirect("/login");

  const competition = await prisma.competition.findUnique({
    where: { id },
    include: {
      divisions: { orderBy: { createdAt: "asc" } },
      city: true,
      registrations: {
        include: { dancer: true, checkIn: true, division: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!competition) notFound();

  // Доступ к странице — глобальные права (SUPER_ADMIN), любое членство в
  // этом конкретном соревновании, ИЛИ открытая регистрация (иначе танцор,
  // который ещё никуда не записан, не смог бы дойти до формы регистрации,
  // на которую сам список /admin/competitions его уже пускает); управление
  // (кнопки) — отдельная, более узкая проверка ниже.
  const isMember = actor.permissionsByCompetition.has(competition.id) || actor.globalPermissions.size > 0;
  if (!isMember && competition.status !== "REGISTRATION_OPEN") redirect("/admin/competitions");

  const canManage = can(actor, "competition:update", competition.id);
  const canManageRegistrations = can(actor, "registration:manage", competition.id);
  const canCheckIn = can(actor, "checkin:manage", competition.id);
  const canReviewRoleOverride = can(actor, "registration:role_override_review", competition.id);
  const myDancer = await prisma.dancer.findUnique({
    where: { userId: actor.userId },
    select: { id: true, gender: true },
  });
  const isRegistrationOpen = competition.status === "REGISTRATION_OPEN";
  const alreadyRegistered = myDancer
    ? competition.registrations.some((r) => r.dancerId === myDancer.id)
    : false;

  return (
    <div className="stack">
      <div>
        <h1 className="page-title">{competition.name}</h1>
        <p className="page-subtitle">
          <Badge variant="community">{STATUS_LABELS[competition.status] ?? competition.status}</Badge>
          {competition.city ? ` · ${competition.city.nameRu}` : ""}
          {competition.venue ? ` · ${competition.venue}` : ""}
        </p>
      </div>

      {canManage && <CompetitionStatusControls competitionId={competition.id} status={competition.status} />}

      <div>
        <h2 className="page-title">Дивизионы</h2>
        {competition.divisions.length === 0 ? (
          <p className="hint-text">Дивизионов пока нет.</p>
        ) : (
          <div className="card-grid">
            {competition.divisions.map((d) => (
              <Card key={d.id}>
                <strong>{d.name}</strong>
                <p className="hint-text mt-1">{DIVISION_LEVEL_LABELS[d.level] ?? d.level}</p>
              </Card>
            ))}
          </div>
        )}
        {canManage && <AddDivisionForm competitionId={competition.id} />}
      </div>

      {isRegistrationOpen && !alreadyRegistered && competition.divisions.length > 0 && (
        <div>
          <h2 className="page-title">Регистрация</h2>
          <RegisterSelfForm
            competitionId={competition.id}
            divisions={competition.divisions}
            suggestedRole={suggestedRoleForGender(myDancer?.gender ?? null)}
          />
        </div>
      )}

      <div>
        <h2 className="page-title">Участники</h2>
        {competition.registrations.length === 0 ? (
          <p className="hint-text">Пока никто не зарегистрирован.</p>
        ) : (
          <div className="stack gap-3">
            {competition.registrations.map((r) => (
              <Card key={r.id} className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <strong>{r.dancer.displayName}</strong>
                  <p className="hint-text mt-1">
                    {r.division.name} · {ROLE_LABELS[r.role] ?? r.role} ·{" "}
                    {REGISTRATION_STATUS_LABELS[r.status] ?? r.status}
                    {r.checkIn && ` · номер ${r.checkIn.bibNumber}`}
                  </p>
                  {r.roleOverrideStatus === "PENDING" && (
                    <p className="hint-text mt-1 text-accent">
                      Просит роль «{ROLE_LABELS[r.requestedRole ?? ""] ?? r.requestedRole}» вместо подсказки по полу —
                      ждёт подтверждения.
                    </p>
                  )}
                  {r.roleOverrideStatus === "REJECTED" && (
                    <p className="hint-text mt-1">Запрошенная роль отклонена, оставлена подсказка по полу.</p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {r.roleOverrideStatus === "PENDING" && canReviewRoleOverride && (
                    <RoleOverrideReview registrationId={r.id} />
                  )}
                  {canCheckIn && r.status === "REGISTERED" && !r.checkIn && (
                    <CheckInButton registrationId={r.id} />
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
        {canManageRegistrations && competition.divisions.length > 0 && (
          <div className="mt-4">
            <h3 className="mb-2">Добавить участника вручную</h3>
            <AdminRegisterForm competitionId={competition.id} divisions={competition.divisions} />
          </div>
        )}
      </div>
    </div>
  );
}
