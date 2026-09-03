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
import { ChangeDivisionControl } from "@/components/admin/ChangeDivisionControl";
import { AddRoundForm } from "@/components/admin/AddRoundForm";
import { GenerateRoundsButton } from "@/components/admin/GenerateRoundsButton";
import { RoundStatusControls } from "@/components/admin/RoundStatusControls";
import { AddHeatButton } from "@/components/admin/AddHeatButton";
import { HeatStatusControls } from "@/components/admin/HeatStatusControls";
import { StartDrawingForm } from "@/components/admin/StartDrawingForm";
import { RerollDrawButton } from "@/components/admin/RerollDrawButton";
import { AddDrawHelperForm } from "@/components/admin/AddDrawHelperForm";
import { SplitHeatButton } from "@/components/admin/SplitHeatButton";
import { DrawParticipantsGrid } from "@/components/admin/DrawParticipantsGrid";
import { suggestedRoleForGender } from "@/server/competition/register-competitor";
import {
  COMPETITION_STATUS_LABELS as STATUS_LABELS,
  REGISTRATION_ROLE_LABELS as ROLE_LABELS,
  REGISTRATION_STATUS_LABELS,
  ROUND_TYPE_LABELS,
  HEAT_STATUS_LABELS,
} from "@/lib/competition-labels";

export default async function CompetitionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getActor();
  if (!actor) redirect("/login");

  const [competition, activeCategories, activeStages] = await Promise.all([
    prisma.competition.findUnique({
      where: { id },
      include: {
        divisions: {
          include: {
            category: true,
            rounds: {
              include: {
                heats: {
                  include: {
                    draws: {
                      orderBy: { version: "desc" },
                      take: 1,
                      include: {
                        participants: {
                          include: { registration: { include: { dancer: true, checkIn: true } } },
                          orderBy: { calledOrder: "asc" },
                        },
                      },
                    },
                  },
                  orderBy: { number: "asc" },
                },
                stage: true,
              },
              orderBy: { order: "asc" },
            },
          },
          orderBy: { category: { order: "asc" } },
        },
        city: true,
      },
    }),
    prisma.divisionCategory.findMany({ where: { isActive: true }, orderBy: { order: "asc" } }),
    prisma.roundStageCatalog.findMany({ where: { isActive: true }, orderBy: { order: "asc" } }),
  ]);
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
  const canChangeDivision = can(actor, "registration:change_division", competition.id);
  const canManageRounds = can(actor, "round:create", competition.id);
  // Полный список участников — только у тех, кому реально нужно им
  // управлять (03 §4: registration.view). Обычный участник (COMPETITOR) не
  // должен видеть чужие регистрации — только свою собственную, ниже.
  const canViewAllRegistrations = can(actor, "registration:view", competition.id);

  const myDancer = await prisma.dancer.findUnique({
    where: { userId: actor.userId },
    select: { id: true, gender: true },
  });

  // Сколько ведущих/ведомых в каждом дивизионе — нужно организатору ДО
  // генерации сетки раундов (та же логика, что использует generateRounds()),
  // поэтому считаем и показываем сразу на карточке дивизиона.
  const [registeredCounts, checkedInCounts] = canManageRounds
    ? await Promise.all([
        prisma.registration.groupBy({
          by: ["divisionId", "role"],
          where: { competitionId: competition.id, status: "REGISTERED" },
          _count: { _all: true },
        }),
        prisma.registration.groupBy({
          by: ["divisionId", "role"],
          where: {
            competitionId: competition.id,
            status: "REGISTERED",
            checkIn: { is: { status: { in: ["CHECKED_IN", "LATE"] } } },
          },
          _count: { _all: true },
        }),
      ])
    : [[], []];
  const countFor = (rows: { divisionId: string; role: string; _count: { _all: number } }[], divisionId: string, role: string) =>
    rows.find((r) => r.divisionId === divisionId && r.role === role)?._count._all ?? 0;

  const registrations = canViewAllRegistrations
    ? await prisma.registration.findMany({
        where: { competitionId: competition.id },
        include: { dancer: true, checkIn: true, division: { include: { category: true } } },
        orderBy: { createdAt: "asc" },
      })
    : [];
  const myRegistration =
    !canViewAllRegistrations && myDancer
      ? await prisma.registration.findFirst({
          where: { competitionId: competition.id, dancerId: myDancer.id },
          include: { checkIn: true, division: { include: { category: true } } },
        })
      : null;

  const isRegistrationOpen = competition.status === "REGISTRATION_OPEN";
  const alreadyRegistered = canViewAllRegistrations
    ? myDancer
      ? registrations.some((r) => r.dancerId === myDancer.id)
      : false
    : myRegistration !== null;

  // Формы регистрации ждут { id, name } — категория дивизиона теперь и есть
  // его "имя" для пользователя.
  const divisionOptions = competition.divisions.map((d) => ({ id: d.id, name: d.category.name }));

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
          <div className="stack gap-3">
            {competition.divisions.map((d) => (
              <Card key={d.id}>
                <strong>{d.category.name}</strong>
                {canManageRounds && (
                  <p className="hint-text mt-1">
                    Ведущих: {countFor(registeredCounts, d.id, "LEADER")} (
                    {countFor(checkedInCounts, d.id, "LEADER")} прошли check-in) · Ведомых:{" "}
                    {countFor(registeredCounts, d.id, "FOLLOWER")} ({countFor(checkedInCounts, d.id, "FOLLOWER")} прошли
                    check-in)
                  </p>
                )}

                {canManageRounds && (
                  <div className="stack gap-2 mt-3">
                    {d.rounds.length === 0 ? (
                      <p className="hint-text">Раундов пока нет.</p>
                    ) : (
                      d.rounds.map((round) => (
                        <div key={round.id} className="rounded-app-sm border border-line p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span>
                              <strong>{round.stage?.name ?? (round.type ? (ROUND_TYPE_LABELS[round.type] ?? round.type) : "—")}</strong>
                              {round.finalistsCount ? ` · проходят ${round.finalistsCount} пар` : ""}
                            </span>
                            <RoundStatusControls roundId={round.id} status={round.status} />
                          </div>

                          <div className="stack gap-1.5 mt-2">
                            {round.heats.map((heat) => {
                              const draw = heat.draws[0];
                              const canEditDraw = round.status === "DRAWING" && heat.status === "PENDING" && !!draw;
                              // Кого звать в помощь — определяется по факту
                              // (какой стороны сейчас меньше в списке), а не
                              // выбором организатора: если уже поровну,
                              // помощь не нужна вообще (docs/00_DECISIONS.md,
                              // 2026-09-04).
                              const leaderCount = draw?.participants.filter((p) => p.role === "LEADER").length ?? 0;
                              const followerCount = draw?.participants.filter((p) => p.role === "FOLLOWER").length ?? 0;
                              const neededRole =
                                leaderCount === followerCount ? null : leaderCount < followerCount ? "LEADER" : "FOLLOWER";
                              // "Разбить" смотрит на РЕАЛЬНЫЙ (не считая
                              // помощников) дисбаланс — доступно, даже если
                              // помощники уже сгладили общее число, это
                              // альтернативный способ, не зависящий от них.
                              const scoredLeaderCount =
                                draw?.participants.filter((p) => p.role === "LEADER" && p.scored).length ?? 0;
                              const scoredFollowerCount =
                                draw?.participants.filter((p) => p.role === "FOLLOWER" && p.scored).length ?? 0;
                              const hasRealImbalance = scoredLeaderCount !== scoredFollowerCount;
                              return (
                                <div key={heat.id} className="pl-3">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span>
                                      Заезд {heat.number} · {HEAT_STATUS_LABELS[heat.status] ?? heat.status}
                                    </span>
                                    <HeatStatusControls heatId={heat.id} status={heat.status} roundStatus={round.status} />
                                  </div>
                                  {draw && (
                                    <DrawParticipantsGrid
                                      heatId={heat.id}
                                      participants={draw.participants}
                                      canEditDraw={canEditDraw}
                                    />
                                  )}
                                  {canEditDraw && (
                                    <div className="flex flex-wrap items-center gap-2 mt-1 pl-3">
                                      <RerollDrawButton heatId={heat.id} />
                                      {neededRole && <AddDrawHelperForm heatId={heat.id} role={neededRole} />}
                                      {hasRealImbalance && <SplitHeatButton heatId={heat.id} />}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                            <div className="pl-3">
                              <AddHeatButton roundId={round.id} />
                            </div>
                          </div>

                          {round.status === "READY" && <StartDrawingForm roundId={round.id} />}
                        </div>
                      ))
                    )}
                    <div className="flex flex-wrap items-start gap-4">
                      <GenerateRoundsButton divisionId={d.id} />
                      <AddRoundForm divisionId={d.id} stages={activeStages} />
                    </div>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
        {canManage && <AddDivisionForm competitionId={competition.id} categories={activeCategories} />}
      </div>

      {isRegistrationOpen && !alreadyRegistered && divisionOptions.length > 0 && (
        <div>
          <h2 className="page-title">Регистрация</h2>
          <RegisterSelfForm
            competitionId={competition.id}
            divisions={divisionOptions}
            suggestedRole={suggestedRoleForGender(myDancer?.gender ?? null)}
          />
        </div>
      )}

      {canViewAllRegistrations ? (
        <div>
          <h2 className="page-title">Участники</h2>
          {registrations.length === 0 ? (
            <p className="hint-text">Пока никто не зарегистрирован.</p>
          ) : (
            <div className="stack gap-3">
              {registrations.map((r) => (
                <Card key={r.id} className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <strong>{r.dancer.displayName}</strong>
                    <p className="hint-text mt-1">
                      {r.division.category.name} · {ROLE_LABELS[r.role] ?? r.role} ·{" "}
                      {REGISTRATION_STATUS_LABELS[r.status] ?? r.status}
                      {r.checkIn && ` · номер ${r.checkIn.bibNumber}`}
                    </p>
                    {r.roleOverrideStatus === "PENDING" && (
                      <p className="hint-text mt-1 text-accent">
                        Просит роль «{ROLE_LABELS[r.requestedRole ?? ""] ?? r.requestedRole}» вместо подсказки по
                        полу — ждёт подтверждения.
                      </p>
                    )}
                    {r.roleOverrideStatus === "REJECTED" && (
                      <p className="hint-text mt-1">Запрошенная роль отклонена, оставлена подсказка по полу.</p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {canChangeDivision && (
                      <ChangeDivisionControl
                        registrationId={r.id}
                        currentDivisionId={r.divisionId}
                        divisions={competition.divisions.map((d) => ({ id: d.id, categoryName: d.category.name }))}
                      />
                    )}
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
          {canManageRegistrations && divisionOptions.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-2">Добавить участника вручную</h3>
              <AdminRegisterForm competitionId={competition.id} divisions={divisionOptions} />
            </div>
          )}
        </div>
      ) : (
        myRegistration && (
          <div>
            <h2 className="page-title">Моя регистрация</h2>
            <Card>
              <p className="m-0">
                {myRegistration.division.category.name} · {ROLE_LABELS[myRegistration.role] ?? myRegistration.role} ·{" "}
                {REGISTRATION_STATUS_LABELS[myRegistration.status] ?? myRegistration.status}
                {myRegistration.checkIn && ` · номер ${myRegistration.checkIn.bibNumber}`}
              </p>
              {myRegistration.roleOverrideStatus === "PENDING" && (
                <p className="hint-text mt-1 text-accent">
                  Вы запросили роль «{ROLE_LABELS[myRegistration.requestedRole ?? ""] ?? myRegistration.requestedRole}»
                  вместо подсказки по полу — организатор ещё не подтвердил.
                </p>
              )}
            </Card>
          </div>
        )
      )}
    </div>
  );
}
