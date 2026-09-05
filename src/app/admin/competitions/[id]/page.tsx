import { notFound, redirect } from "next/navigation";
import type { RegistrationRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/server/rbac/actor";
import { can } from "@/server/rbac/authorize";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AddDivisionForm } from "@/components/admin/AddDivisionForm";
import { DivisionSettingsPanel } from "@/components/admin/DivisionSettingsPanel";
import { DeleteDivisionButton } from "@/components/admin/DeleteDivisionButton";
import { CompetitionStatusControls } from "@/components/admin/CompetitionStatusControls";
import { RegisterSelfForm } from "@/components/admin/RegisterSelfForm";
import { AdminRegisterForm } from "@/components/admin/AdminRegisterForm";
import { CheckInButton } from "@/components/admin/CheckInButton";
import { RoleOverrideReview } from "@/components/admin/RoleOverrideReview";
import { ChangeDivisionControl } from "@/components/admin/ChangeDivisionControl";
import { GenerateRoundsButton } from "@/components/admin/GenerateRoundsButton";
import { RoundStatusControls } from "@/components/admin/RoundStatusControls";
import { AddHeatButton } from "@/components/admin/AddHeatButton";
import { HeatStatusControls } from "@/components/admin/HeatStatusControls";
import { StartDrawingForm } from "@/components/admin/StartDrawingForm";
import { RerollDrawButton } from "@/components/admin/RerollDrawButton";
import { AddDrawHelperForm } from "@/components/admin/AddDrawHelperForm";
import { SplitHeatButton } from "@/components/admin/SplitHeatButton";
import { DrawParticipantsGrid } from "@/components/admin/DrawParticipantsGrid";
import { RotationPanel } from "@/components/admin/RotationPanel";
import { DivisionJudgesPanel, type PoolJudge } from "@/components/admin/DivisionJudgesPanel";
import { ScoringProgress } from "@/components/admin/ScoringProgress";
import { TieBreakDecisionForm } from "@/components/admin/TieBreakDecisionForm";
import { suggestedRoleForGender } from "@/server/competition/register-competitor";
import { getRoundScoringProgress, rolesNotNeedingJudging } from "@/server/judging/advancement";
import { getFinalScoringProgress } from "@/server/judging/final-advancement";
import { FinalSettingsPanel } from "@/components/admin/FinalSettingsPanel";
import { StartFinalPanel } from "@/components/admin/StartFinalPanel";
import { FinalResultsTable } from "@/components/admin/FinalResultsTable";
import { FinalTieBreakDecisionForm } from "@/components/admin/FinalTieBreakDecisionForm";
import { JudgesDanceStagePanel } from "@/components/admin/JudgesDanceStagePanel";
import { RandomCouplesPanel } from "@/components/admin/RandomCouplesPanel";
import { DivisionResultsPanel } from "@/components/admin/DivisionResultsPanel";
import { CompetitionResultsPanel } from "@/components/admin/CompetitionResultsPanel";
import { RoundAdvancementPublish } from "@/components/admin/RoundAdvancementPublish";
import { getCurrentDivisionResults } from "@/server/results/results";
import { CompetitionStatisticsPanel } from "@/components/admin/CompetitionStatisticsPanel";
import { JudgeStatisticsPanel } from "@/components/admin/JudgeStatisticsPanel";
import { getCompetitionStatistics } from "@/server/statistics/competition-statistics";
import { getJudgeStatisticsForCompetition } from "@/server/statistics/judge-statistics";
import { PublicInfoPanel } from "@/components/admin/PublicInfoPanel";
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

  // myDancer зависит только от actor.userId (не от competition) — грузится
  // в том же Promise.all, что и всё остальное на этой странице, а не
  // отдельным await после него (лишний round-trip к Supabase pooler,
  // ~150мс, без всякой причины ждать).
  const [competition, activeCategories, activeStages, myDancer] = await Promise.all([
    prisma.competition.findUnique({
      where: { id },
      // relationLoadStrategy: "join" — глубоко вложенный include (5 уровней)
      // без этого выполняется отдельным SQL-запросом на каждый уровень
      // (замерено: 9 round-trip'ов, ~775мс на удалённой БД через Supabase
      // pooler); с "join" — 4 round-trip'а, ~500мс.
      relationLoadStrategy: "join",
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
                          include: {
                            registration: {
                              include: { dancer: true, checkIn: true, division: { select: { category: { select: { name: true } } } } },
                            },
                          },
                          orderBy: { calledOrder: "asc" },
                        },
                      },
                    },
                  },
                  orderBy: { number: "asc" },
                },
                stage: true,
                results: {
                  include: { registration: { include: { dancer: { select: { displayName: true } }, checkIn: { select: { bibNumber: true } } } } },
                  orderBy: { rank: "asc" },
                },
                finalSession: {
                  select: {
                    id: true,
                    format: true,
                    currentStage: true,
                    criteriaSnapshot: true,
                    pairs: {
                      orderBy: { pairNumber: "asc" },
                      include: {
                        leaderRegistration: { include: { dancer: { select: { displayName: true } }, checkIn: { select: { bibNumber: true } } } },
                        followerRegistration: { include: { dancer: { select: { displayName: true } }, checkIn: { select: { bibNumber: true } } } },
                      },
                    },
                  },
                },
                finalResults: {
                  include: { registration: { include: { dancer: { select: { displayName: true } }, checkIn: { select: { bibNumber: true } } } } },
                },
              },
              orderBy: { order: "asc" },
            },
            judgeAssignments: { include: { judge: { select: { email: true } } }, orderBy: { createdAt: "asc" } },
            stagePlan: { include: { stage: { select: { name: true } } }, orderBy: { stage: { order: "asc" } } },
            finalSettings: true,
            finalCriteria: { orderBy: { sortOrder: "asc" } },
            _count: { select: { registrations: true } },
          },
          orderBy: { category: { order: "asc" } },
        },
        city: true,
      },
    }),
    prisma.divisionCategory.findMany({ where: { isActive: true }, orderBy: { order: "asc" } }),
    prisma.roundStageCatalog.findMany({ where: { isActive: true }, orderBy: { order: "asc" } }),
    prisma.dancer.findUnique({ where: { userId: actor.userId }, select: { id: true, gender: true } }),
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
  const canAssignJudges = can(actor, "judge:assign", competition.id);
  const canDecideTieBreak = can(actor, "tie_break:decide", competition.id);
  const canConfigureFinal = can(actor, "final:configure", competition.id);
  const canManageFinal = can(actor, "final:manage", competition.id);
  const canCalculateResults = can(actor, "result:calculate", competition.id);
  const canReviewResults = can(actor, "result:review", competition.id);
  const canPublishResults = can(actor, "result:publish", competition.id);
  const canViewStatistics = can(actor, "statistics:view", competition.id);
  const canEditPublicInfo = can(actor, "competition:settings_update", competition.id);
  const isJudge = can(actor, "score:submit", competition.id);
  // Полный список участников — только у тех, кому реально нужно им
  // управлять (03 §4: registration.view). Обычный участник (COMPETITOR) не
  // должен видеть чужие регистрации — только свою собственную, ниже.
  const canViewAllRegistrations = can(actor, "registration:view", competition.id);

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

  // Общий пул судей всего соревнования (по всем дивизионам) — источник
  // галочек в DivisionJudgesPanel; уже загружен вместе с деревом
  // соревнования выше, отдельным запросом не тянем (docs/00_DECISIONS.md,
  // A13 — один судья может судить несколько дивизионов).
  const competitionJudgePoolMap = new Map<string, PoolJudge>();
  for (const d of competition.divisions) {
    for (const ja of d.judgeAssignments) {
      competitionJudgePoolMap.set(ja.judgeUserId, { judgeUserId: ja.judgeUserId, judgeEmail: ja.judge.email });
    }
  }
  const competitionJudgePool = [...competitionJudgePoolMap.values()].sort((a, b) => a.judgeEmail.localeCompare(b.judgeEmail));

  // Прогресс подсчёта баллов считается заранее (не внутри .map()) — реальные
  // цифры "сколько оценок собрано / сколько нужно", не выдуманный прогресс.
  const scoringRounds = competition.divisions
    .flatMap((d) => d.rounds)
    .filter((r) => r.status === "SCORING" && r.type !== "TIE_BREAK");
  // Финал (FinalSession уже начата) считается своим прогрессом (критерий ×
  // судья), обычные раунды — старым (одна оценка на участника).
  const scoringProgressByRoundId = new Map(
    await Promise.all(
      scoringRounds.map(
        async (r) => [r.id, r.finalSession ? await getFinalScoringProgress(r.id) : await getRoundScoringProgress(r.id)] as const
      )
    )
  );

  // Роли, которых в раунде не нужно оценивать (участников не больше, чем
  // мест — все проходят автоматически, по запросу пользователя,
  // 2026-09-04) — из уже загруженного дерева, без доп. запросов; "финал" —
  // раунд, после которого в этом же дивизионе нет другого обычного раунда.
  const skippedRolesByRoundId = new Map<string, RegistrationRole[]>();
  for (const d of competition.divisions) {
    for (const round of d.rounds) {
      if (round.status !== "SCORING" || round.type === "TIE_BREAK") continue;
      const roleCounts: Record<RegistrationRole, number> = { LEADER: 0, FOLLOWER: 0 };
      for (const heat of round.heats) {
        for (const p of heat.draws[0]?.participants ?? []) {
          if (p.scored) roleCounts[p.role]++;
        }
      }
      const isFinal = !d.rounds.some((r) => r.type === null && r.order > round.order);
      const skipped = rolesNotNeedingJudging(roleCounts, round.finalistsCount ?? 0, isFinal, round.type);
      if (skipped.size > 0) skippedRolesByRoundId.set(round.id, [...skipped]);
    }
  }

  // Официальный протокол результатов (Этап 10) — виден, только когда
  // финальный раунд дивизиона (последний обычный по order) уже COMPLETED, и
  // только тем, кто вообще может считать результаты (иначе лишний запрос
  // впустую).
  const finalRoundCompletedByDivisionId = new Map<string, boolean>();
  for (const d of competition.divisions) {
    const regularRounds = d.rounds.filter((r) => r.type === null).sort((a, b) => b.order - a.order);
    finalRoundCompletedByDivisionId.set(d.id, regularRounds[0]?.status === "COMPLETED");
  }
  const divisionResultsById: Map<string, Awaited<ReturnType<typeof getCurrentDivisionResults>>> = canCalculateResults
    ? new Map(
        await Promise.all(
          competition.divisions
            .filter((d) => finalRoundCompletedByDivisionId.get(d.id))
            .map(async (d) => [d.id, await getCurrentDivisionResults(d.id)] as const)
        )
      )
    : new Map();

  const [competitionStatistics, judgeStatistics] = canViewStatistics
    ? await Promise.all([getCompetitionStatistics(competition.id), getJudgeStatisticsForCompetition(competition.id)])
    : [null, []];

  const registrations = canViewAllRegistrations
    ? await prisma.registration.findMany({
        where: { competitionId: competition.id },
        relationLoadStrategy: "join",
        include: { dancer: true, checkIn: true, division: { include: { category: true } } },
        orderBy: { createdAt: "asc" },
      })
    : [];
  const myRegistration =
    !canViewAllRegistrations && myDancer
      ? await prisma.registration.findFirst({
          where: { competitionId: competition.id, dancerId: myDancer.id },
          relationLoadStrategy: "join",
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
      {canEditPublicInfo && (
        <PublicInfoPanel
          competitionId={competition.id}
          info={{
            rulesText: competition.rulesText ?? "",
            rulesUrl: competition.rulesUrl ?? "",
            mediaUrl: competition.mediaUrl ?? "",
          }}
        />
      )}
      {canPublishResults && <CompetitionResultsPanel competitionId={competition.id} publicResults={competition.publicResults} />}
      {competitionStatistics && <CompetitionStatisticsPanel statistics={competitionStatistics} />}
      {judgeStatistics.length > 0 && <JudgeStatisticsPanel judges={judgeStatistics} />}
      {isJudge && (
        <p>
          <a href={`/judging/${competition.id}`}>Моё судейство →</a>
        </p>
      )}

      <div>
        <h2 className="page-title">Дивизионы</h2>
        {competition.divisions.length === 0 ? (
          <p className="hint-text">Дивизионов пока нет.</p>
        ) : (
          <div className="stack gap-3">
            {competition.divisions.map((d) => (
              <Card key={d.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong>{d.category.name}</strong>
                  {canManage && <DeleteDivisionButton divisionId={d.id} hasRegistrations={d._count.registrations > 0} />}
                </div>
                {canManage && (
                  <DivisionSettingsPanel
                    divisionId={d.id}
                    settings={{
                      heatCapacity: d.heatCapacity,
                      rotationMode: d.rotationMode,
                      rotationIntervalSec: d.rotationIntervalSec,
                      rotationShiftMin: d.rotationShiftMin,
                      rotationShiftMax: d.rotationShiftMax,
                    }}
                  />
                )}
                {canManageRounds && (
                  <p className="hint-text mt-1">
                    Ведущих: {countFor(registeredCounts, d.id, "LEADER")} (
                    {countFor(checkedInCounts, d.id, "LEADER")} прошли check-in) · Ведомых:{" "}
                    {countFor(registeredCounts, d.id, "FOLLOWER")} ({countFor(checkedInCounts, d.id, "FOLLOWER")} прошли
                    check-in)
                  </p>
                )}
                {canManageRounds && (
                  <p className="hint-text">
                    План по этапам:{" "}
                    {d.stagePlan.length === 0
                      ? "не задан"
                      : d.stagePlan.map((p) => `${p.stage.name} ${p.participantCount}`).join(" · ")}
                  </p>
                )}

                {canAssignJudges && (
                  <DivisionJudgesPanel
                    divisionId={d.id}
                    pool={competitionJudgePool}
                    leaderJudgeUserIds={d.judgeAssignments.filter((ja) => ja.role === "LEADER").map((ja) => ja.judgeUserId)}
                    followerJudgeUserIds={d.judgeAssignments.filter((ja) => ja.role === "FOLLOWER").map((ja) => ja.judgeUserId)}
                  />
                )}

                {canConfigureFinal && (
                  <FinalSettingsPanel
                    divisionId={d.id}
                    format={d.finalSettings?.format ?? "NORMAL"}
                    tracksCount={d.finalSettings?.tracksCount ?? 1}
                    partnerChangeEnabled={d.finalSettings?.partnerChangeEnabled ?? false}
                    config={d.finalSettings?.config ?? {}}
                    criteria={d.finalCriteria.map((c) => ({
                      id: c.id,
                      name: c.name,
                      priority: c.priority,
                      minScore: c.minScore,
                      maxScore: c.maxScore,
                      step: c.step,
                    }))}
                    locked={d.rounds.some((r) => r.finalSession)}
                  />
                )}

                {canManageRounds && (
                  <div className="stack gap-2 mt-3">
                    {d.rounds.length === 0 ? (
                      <p className="hint-text">Раундов пока нет.</p>
                    ) : (
                      d.rounds.map((round) => {
                        // Финал — последний по order обычный (не служебный)
                        // раунд дивизиона (тот же признак, что и
                        // isFinalStageInTx на сервере, advancement.ts).
                        const isFinalRound = round.type === null && !d.rounds.some((r) => r.type === null && r.order > round.order);
                        const tieGroupConfig = round.config as { finalTieGroupKey?: string; tieBreakKind?: string } | null;
                        const isFinalTieBreak = round.type === "TIE_BREAK" && !!tieGroupConfig?.finalTieGroupKey;
                        // TIEBREAK-001: перетанцовка "за место" в финале без критериальной
                        // системы (никого не отсеивают, нужен только порядок внутри группы).
                        const isFullRankTieBreak = round.type === "TIE_BREAK" && tieGroupConfig?.tieBreakKind === "FULL_RANK";
                        const isJudgesDance = round.finalSession?.format === "JUDGES_DANCE";
                        const isRandomCouples = round.finalSession?.format === "RANDOM_COUPLES";
                        const usesCustomFinalFlow = isJudgesDance || isRandomCouples;
                        return (
                        <div key={round.id} className="rounded-app-sm border border-line p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span>
                              <strong>{round.stage?.name ?? (round.type ? (ROUND_TYPE_LABELS[round.type] ?? round.type) : "—")}</strong>
                              {round.finalistsCount ? ` · проходят ${round.finalistsCount} пар` : ""}
                            </span>
                            <RoundStatusControls roundId={round.id} status={round.status} />
                          </div>

                          {isFinalRound && round.status === "READY" && !round.finalSession && canManageFinal && (
                            <StartFinalPanel roundId={round.id} />
                          )}

                          {isJudgesDance && round.status !== "COMPLETED" && canManageFinal && (
                            <JudgesDanceStagePanel roundId={round.id} currentStage={round.finalSession!.currentStage} />
                          )}

                          {isRandomCouples && round.status !== "COMPLETED" && canManageFinal && (
                            <RandomCouplesPanel
                              roundId={round.id}
                              pairs={(round.finalSession!.pairs ?? []).map((p) => ({
                                pairNumber: p.pairNumber,
                                leaderName: p.leaderRegistration.dancer.displayName,
                                leaderBib: p.leaderRegistration.checkIn?.bibNumber ?? null,
                                followerName: p.followerRegistration.dancer.displayName,
                                followerBib: p.followerRegistration.checkIn?.bibNumber ?? null,
                                trackName: p.trackName,
                              }))}
                            />
                          )}

                          {round.status === "SCORING" && round.type !== "TIE_BREAK" && (
                            <>
                              {skippedRolesByRoundId.has(round.id) && (
                                <p className="hint-text">
                                  {skippedRolesByRoundId
                                    .get(round.id)!
                                    .map((r) => ROLE_LABELS[r] ?? r)
                                    .join(", ")}{" "}
                                  не оценивается — участников не больше, чем мест, проходят автоматически.
                                </p>
                              )}
                              <ScoringProgress {...(scoringProgressByRoundId.get(round.id) ?? { required: 0, submitted: 0 })} />
                            </>
                          )}

                          {round.status === "SCORING" && round.type === "TIE_BREAK" && isFinalTieBreak && canDecideTieBreak && (
                            <FinalTieBreakDecisionForm
                              tieBreakRoundId={round.id}
                              candidates={(round.heats[0]?.draws[0]?.participants ?? [])
                                .filter((p) => p.scored)
                                .map((p) => ({
                                  registrationId: p.registrationId,
                                  bibNumber: p.registration.checkIn?.bibNumber ?? null,
                                  displayName: p.registration.dancer.displayName,
                                }))}
                            />
                          )}

                          {round.status === "SCORING" && round.type === "TIE_BREAK" && !isFinalTieBreak && canDecideTieBreak && (
                            <TieBreakDecisionForm
                              tieBreakRoundId={round.id}
                              expectedCount={round.finalistsCount ?? 0}
                              fullRank={isFullRankTieBreak}
                              candidates={(round.heats[0]?.draws[0]?.participants ?? [])
                                .filter((p) => p.scored)
                                .map((p) => ({
                                  registrationId: p.registrationId,
                                  bibNumber: p.registration.checkIn?.bibNumber ?? null,
                                  displayName: p.registration.dancer.displayName,
                                  role: p.role,
                                }))}
                            />
                          )}

                          {(round.status === "SCORING" || round.status === "COMPLETED") && round.finalSession && round.finalResults.length > 0 && (
                            <FinalResultsTable
                              criteria={round.finalSession!.criteriaSnapshot as unknown as { id: string; name: string; priority: number }[]}
                              results={round.finalResults.map((r) => ({
                                registrationId: r.registrationId,
                                role: r.role,
                                displayName: r.registration.dancer.displayName,
                                bibNumber: r.registration.checkIn?.bibNumber ?? null,
                                totalScore: r.totalScore,
                                criteriaTotals: r.criteriaTotals as Record<string, number>,
                                place: r.place,
                                tieGroupKey: r.tieGroupKey,
                              }))}
                            />
                          )}

                          {round.status === "COMPLETED" && !round.finalSession && round.results.length > 0 && (
                            <div className="mt-2 grid grid-cols-2 gap-3">
                              {(["LEADER", "FOLLOWER"] as const).map((r) => (
                                <div key={r}>
                                  <p className="hint-text">{r === "LEADER" ? "Ведущие" : "Ведомые"}</p>
                                  <ul className="stack gap-0.5">
                                    {round.results
                                      .filter((res) => res.registration.role === r)
                                      .map((res) => (
                                        <li key={res.id} className={res.status === "ADVANCED" ? "" : "hint-text line-through"}>
                                          №{res.registration.checkIn?.bibNumber ?? "—"} {res.registration.dancer.displayName} —{" "}
                                          {res.status === "ADVANCED" ? "прошёл" : "не прошёл"} ({res.scoreSum})
                                        </li>
                                      ))}
                                  </ul>
                                </div>
                              ))}
                            </div>
                          )}

                          {round.status === "COMPLETED" && round.type !== "TIE_BREAK" && !isFinalRound && canPublishResults && (
                            <RoundAdvancementPublish
                              roundId={round.id}
                              publishedAt={round.advancementPublishedAt ? round.advancementPublishedAt.toISOString() : null}
                            />
                          )}

                          {isJudgesDance && (
                            // JUDGES_DANCE не использует Draw Engine (партнёр
                            // участника — судья, не другой финалист, A5) — заходы
                            // управляются целиком через JudgesDanceStagePanel выше,
                            // здесь только read-only список вызванных по стадиям.
                            <div className="stack gap-1.5 mt-2">
                              {round.heats.map((heat) => (
                                <div key={heat.id} className="pl-3">
                                  <p className="hint-text m-0">
                                    Стадия {heat.number} ({heat.number === 1 ? "Ведущие" : "Ведомые"}) · {HEAT_STATUS_LABELS[heat.status] ?? heat.status}
                                  </p>
                                  <ul className="stack gap-0.5 m-0 pl-4">
                                    {(heat.draws[0]?.participants ?? []).map((p) => (
                                      <li key={p.id}>
                                        №{p.registration.checkIn?.bibNumber ?? "—"} {p.registration.dancer.displayName}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              ))}
                            </div>
                          )}

                          {isRandomCouples && (
                            // Список пар уже виден в RandomCouplesPanel выше
                            // (с именами/треком) — здесь только статус захода
                            // каждой пары, для контроля "кто сейчас танцует".
                            <div className="stack gap-1.5 mt-2">
                              {round.heats.map((heat) => (
                                <p key={heat.id} className="hint-text m-0 pl-3">
                                  Пара {heat.number} · {HEAT_STATUS_LABELS[heat.status] ?? heat.status}
                                </p>
                              ))}
                            </div>
                          )}

                          {!usesCustomFinalFlow && (
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
                              // Если меньшая сторона — 0 реальных участников,
                              // разбивка унесла бы их всех в новый заезд и
                              // текущий остался бы пустым — кнопку не
                              // показываем вовсе (сервер такое тоже отклонит,
                              // 2026-09-04).
                              const hasRealImbalance =
                                scoredLeaderCount !== scoredFollowerCount && Math.min(scoredLeaderCount, scoredFollowerCount) > 0;
                              return (
                                <div key={heat.id} className="pl-3">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span>
                                      Заход {heat.number} · {HEAT_STATUS_LABELS[heat.status] ?? heat.status}
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
                                  {heat.status !== "PENDING" && <RotationPanel heatId={heat.id} />}
                                </div>
                              );
                            })}
                            {/* После DRAW_LOCKED у каждого захода уже обязана быть жеребьёвка
                                (round-state.ts) — новый заход без списка нарушил бы это, поэтому
                                кнопку прячем, как только жеребьёвка зафиксирована. */}
                            {(round.status === "DRAFT" || round.status === "READY" || round.status === "DRAWING") && (
                              <div className="pl-3">
                                <AddHeatButton roundId={round.id} />
                              </div>
                            )}
                          </div>
                          )}

                          {!usesCustomFinalFlow && round.status === "READY" && <StartDrawingForm roundId={round.id} />}
                        </div>
                        );
                      })
                    )}
                    <div className="flex flex-wrap items-start gap-4">
                      <GenerateRoundsButton divisionId={d.id} hasExistingRounds={d.rounds.length > 0} />
                    </div>
                  </div>
                )}

                {canCalculateResults && (
                  <DivisionResultsPanel
                    divisionId={d.id}
                    finalRoundCompleted={finalRoundCompletedByDivisionId.get(d.id) ?? false}
                    hasResults={(divisionResultsById.get(d.id)?.length ?? 0) > 0}
                    reviewedAt={d.resultsReviewedAt ? d.resultsReviewedAt.toISOString() : null}
                    canReview={canReviewResults}
                    canCorrect={canPublishResults}
                    rows={(divisionResultsById.get(d.id) ?? []).map((r) => ({
                      id: r.id,
                      registrationId: r.registrationId,
                      role: r.role,
                      displayName: r.displayName,
                      bibNumber: r.bibNumber,
                      status: r.status,
                      placement: r.placement,
                      publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null,
                    }))}
                  />
                )}
              </Card>
            ))}
          </div>
        )}
        {canManage && (
          <AddDivisionForm
            competitionId={competition.id}
            categories={activeCategories.filter(
              (c) => !competition.divisions.some((d) => d.categoryId === c.id)
            )}
            stages={activeStages}
          />
        )}
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
