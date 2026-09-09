import { Suspense, type ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import type { RegistrationRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getMyDancerRef } from "@/lib/dancer";
import { measureServerOperation } from "@/lib/performance-debug/server";
import { getActor } from "@/server/rbac/actor";
import { can } from "@/server/rbac/authorize";
import { Card } from "@/components/ui/card";
import { DivisionSettingsPanel } from "@/components/admin/DivisionSettingsPanel";
import { DivisionsOverviewTable, type DivisionOverviewRow } from "@/components/admin/DivisionsOverviewTable";
import { CompetitionStatusControls } from "@/components/admin/CompetitionStatusControls";
import { RegisterSelfForm } from "@/components/admin/RegisterSelfForm";
import { AddParticipantPanel } from "@/components/admin/AddParticipantPanel";
import { AddButton } from "@/components/admin/AddButton";
import { GenerateRoundsButton } from "@/components/admin/GenerateRoundsButton";
import { CompetitionMonitor } from "@/components/admin/monitor/CompetitionMonitor";
import type { MonitorCategory, MonitorHeat, MonitorJudge, MonitorParticipant, MonitorRound } from "@/components/admin/monitor/types";
import type { PoolJudge } from "@/components/admin/DivisionJudgesPanel";
import { JudgesWorkspace, type JudgingDivision } from "@/components/admin/JudgesWorkspace";
import { AddCompetitionJudgeForm } from "@/components/admin/AddCompetitionJudgeForm";
import { JudgeRegistryPanel, type RegistryJudge } from "@/components/admin/JudgeRegistryPanel";
import { categoryDotColor } from "@/components/admin/category-colors";
import { ScoringProgress } from "@/components/admin/ScoringProgress";
import { TieBreakDecisionForm } from "@/components/admin/TieBreakDecisionForm";
import { suggestedRoleForGender } from "@/server/competition/register-competitor";
import { isNoShow } from "@/server/competition/no-show";
import { getRoundScoringProgress, rolesNotNeedingJudging } from "@/server/judging/advancement";
import { getFinalScoringProgress } from "@/server/judging/final-advancement";
import { StartFinalPanel } from "@/components/admin/StartFinalPanel";
import { FinalResultsTable } from "@/components/admin/FinalResultsTable";
import { FinalTieBreakDecisionForm } from "@/components/admin/FinalTieBreakDecisionForm";
import { JudgesDanceStagePanel } from "@/components/admin/JudgesDanceStagePanel";
import { RandomCouplesPanel } from "@/components/admin/RandomCouplesPanel";
import { DivisionResultsPanel } from "@/components/admin/DivisionResultsPanel";
import { CompetitionResultsPanel } from "@/components/admin/CompetitionResultsPanel";
import { RoundAdvancementPublish } from "@/components/admin/RoundAdvancementPublish";
import { getCurrentDivisionResults } from "@/server/results/results";
import { StatisticsSection } from "@/components/admin/StatisticsSection";
import { PublicInfoPanel } from "@/components/admin/PublicInfoPanel";
import { DeleteCompetitionButton } from "@/components/admin/DeleteCompetitionButton";
import { CompetitionHeader } from "@/components/admin/CompetitionHeader";
import { CompetitionWorkspaceTabs } from "@/components/admin/CompetitionWorkspaceTabs";
import { ParticipantsPanel } from "@/components/admin/ParticipantsPanel";
import { StatCard } from "@/components/admin/StatCard";
import {
  COMPETITION_STATUS_LABELS as STATUS_LABELS,
  REGISTRATION_ROLE_LABELS as ROLE_LABELS,
  REGISTRATION_ROLE_LABELS_PLURAL as ROLE_LABELS_PLURAL,
  REGISTRATION_STATUS_LABELS,
  ROUND_TYPE_LABELS,
  ROUND_STATUS_LABELS,
  HEAT_STATUS_LABELS,
  JUDGING_MAX_SCORE_LABELS,
  FINAL_FORMAT_LABELS,
} from "@/lib/competition-labels";

export default async function CompetitionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getActor();
  if (!actor) redirect("/login");

  // myDancer зависит только от actor.userId (не от competition) — грузится
  // в том же Promise.all, что и всё остальное на этой странице, а не
  // отдельным await после него (лишний round-trip к Supabase pooler,
  // ~150мс, без всякой причины ждать).
  const [competition, activeCategories, activeStages, criterionCatalog, myDancer] = await measureServerOperation("admin.open_competition", () =>
    Promise.all([
    prisma.competition.findFirst({
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
            judgeAssignments: {
              // id нужен монитору: live-итоги оценок приходят с сервера
              // ключами по judgeAssignmentId (score-monitor.ts), и без него
              // строку судьи не с чем было бы сопоставить.
              select: { id: true, judgeUserId: true, role: true },
              orderBy: { createdAt: "asc" },
            },
            stagePlan: { include: { stage: { select: { name: true } } }, orderBy: { stage: { order: "asc" } } },
            finalSettings: true,
            finalCriteria: { orderBy: { sortOrder: "asc" } },
            _count: { select: { registrations: true } },
          },
          orderBy: { category: { order: "asc" } },
        },
        city: true,
        // Общий ростер судей соревнования (CompetitionMember, роль JUDGE) —
        // источник "Общий список судей" (может включать людей, ещё НЕ
        // назначенных ни на одну категорию, 2026-09-09) и общего pool'а для
        // DivisionJudgesPanel (выбор "из уже добавленных").
        members: {
          where: { role: { code: "JUDGE" } },
          include: { user: { select: { email: true, dancer: { select: { displayName: true, gender: true } } } } },
          orderBy: { addedAt: "asc" },
        },
      },
    }),
    prisma.divisionCategory.findMany({ where: { isActive: true }, orderBy: { order: "asc" } }),
    prisma.roundStageCatalog.findMany({ where: { isActive: true }, orderBy: { order: "asc" } }),
    prisma.judgingCriterionCatalog.findMany({ where: { isActive: true }, orderBy: { order: "asc" } }),
    getMyDancerRef(),
    ])
  );
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
  const canViewScoreMonitor = can(actor, "score:view_all", competition.id);
  const canEditPublicInfo = can(actor, "competition:settings_update", competition.id);
  // Без competitionId — глобальное право, как competition:create: по сиду
  // им обладает только SUPER_ADMIN, EVENT_ADMIN конкретного соревнования его
  // не получает (по прямому запросу пользователя, 2026-09-09 — "только для
  // супер админа").
  const canDeleteCompetition = can(actor, "competition:delete");
  const isJudge = can(actor, "score:submit", competition.id);
  // Полный список участников — только у тех, кому реально нужно им
  // управлять (03 §4: registration.view). Обычный участник (COMPETITOR) не
  // должен видеть чужие регистрации — только свою собственную, ниже.
  const canViewAllRegistrations = can(actor, "registration:view", competition.id);

  // Всё, что нужно странице после дерева соревнования, грузится ОДНОЙ
  // волной. Раньше это были 7 последовательных `await` подряд (счётчики
  // ролей → прогресс судейства → протоколы дивизионов → статистика →
  // регистрации → своя регистрация → "уже зарегистрирован?"), хотя между
  // собой они не связаны: каждому нужен только competition/actor, уже
  // известные выше. На удалённой БД (Supabase pooler) каждый такой
  // `await` — отдельный сетевой барьер: пока не ответил предыдущий, следующий
  // даже не начинается. Замер 2026-09-08: страница делала 29 SQL-запросов
  // при 40мс суммарной работы БД и ~1.8с стены — время уходило именно в
  // последовательные round-trip'ы, а не в сами запросы.
  //
  // Порядок вычислений внутри волны сохранён ровно тот же, что и был; ниже
  // только распаковка результатов.

  // Сколько ведущих/ведомых в каждом дивизионе — нужно организатору ДО
  // генерации сетки раундов (та же логика, что использует generateRounds()),
  // поэтому считаем и показываем сразу на карточке дивизиона.
  const registeredCountsPromise = canManageRounds
    ? prisma.registration.groupBy({
        by: ["divisionId", "role"],
        where: { competitionId: competition.id, status: "REGISTERED" },
        _count: { _all: true },
      })
    : Promise.resolve([]);
  const checkedInCountsPromise = canManageRounds
    ? prisma.registration.groupBy({
        by: ["divisionId", "role"],
        where: {
          competitionId: competition.id,
          status: "REGISTERED",
          checkIn: { is: { status: { in: ["CHECKED_IN", "LATE"] } } },
        },
        _count: { _all: true },
      })
    : Promise.resolve([]);
  const countFor = (rows: { divisionId: string; role: string; _count: { _all: number } }[], divisionId: string, role: string) =>
    rows.find((r) => r.divisionId === divisionId && r.role === role)?._count._all ?? 0;

  // Только для отображения в "Реестр судей" (какие категории судит каждый,
  // каким цветом — тем же, что точка категории в сайдбаре ниже, чтобы одна и
  // та же категория узнавалась в обоих местах, 2026-09-09) и в каких ролях
  // (LEADER/FOLLOWER) — не часть контракта DivisionJudgesPanel, отдельная
  // структура. Роль судьи не хранится как отдельное поле нигде — это просто
  // объединение ролей всех его JudgeAssignment по всем категориям. Тот же
  // judgeRoles используется и ниже, в пуле для DivisionJudgesPanel (фильтр
  // "Добавить судью" по колонке — 2026-09-09).
  const judgeDivisionChips = new Map<string, { name: string; color: string }[]>();
  const judgeRoles = new Map<string, Set<RegistrationRole>>();
  competition.divisions.forEach((d, i) => {
    const color = categoryDotColor(i);
    for (const ja of d.judgeAssignments) {
      const chips = judgeDivisionChips.get(ja.judgeUserId) ?? [];
      if (!chips.some((c) => c.name === d.category.name)) chips.push({ name: d.category.name, color });
      judgeDivisionChips.set(ja.judgeUserId, chips);

      const roles = judgeRoles.get(ja.judgeUserId) ?? new Set<RegistrationRole>();
      roles.add(ja.role);
      judgeRoles.set(ja.judgeUserId, roles);
    }
  });

  // Общий ростер судей соревнования — из CompetitionMember(role=JUDGE), а не
  // из назначений на категории (2026-09-09): судья появляется здесь сразу
  // после добавления в "Общий список судей" (AddCompetitionJudgeForm), даже
  // если ещё не назначен ни на одну категорию — это и есть тот самый список,
  // из которого DivisionJudgesPanel ниже выбирает, кого добавить. displayName
  // — из профиля танцора судьи, если он у него есть (у судей без профиля его
  // нет — тогда показывается email, реальных данных не выдумываем). `roles` —
  // объединение ролей по ВСЕМ категориям этого соревнования (см. judgeRoles
  // выше) — DivisionJudgesPanel использует его, чтобы в окне "Добавить судью"
  // под колонкой "Судят партнёров" показывать только тех, кто и правда где-то
  // ещё судит партнёров (плюс тех, кто пока не судит нигде вообще — им ещё не
  // из чего было бы определиться).
  const competitionJudgePool: PoolJudge[] = competition.members
    .map((m) => ({
      judgeUserId: m.userId,
      judgeEmail: m.user.email,
      displayName: m.user.dancer?.displayName ?? null,
      gender: m.user.dancer?.gender ?? null,
      roles: [...(judgeRoles.get(m.userId) ?? [])],
    }))
    .sort((a, b) => (a.displayName ?? a.judgeEmail).localeCompare(b.displayName ?? b.judgeEmail, "ru"));

  // Соревнование ещё не началось — то же понятие, что и в
  // updateDivisionSettings() (COMPETITION_NOT_STARTED_STATUSES): метод
  // оценки раундов до финала можно менять только до этой границы
  // (docs/00_DECISIONS.md, вкладка "Судьи" → "Настройки судейства",
  // 2026-09-09).
  const COMPETITION_NOT_STARTED_STATUSES = new Set(["DRAFT", "REGISTRATION_OPEN", "REGISTRATION_CLOSED", "CHECK_IN", "READY"]);
  const competitionNotStarted = COMPETITION_NOT_STARTED_STATUSES.has(competition.status);

  // Прогресс подсчёта баллов считается заранее (не внутри .map()) — реальные
  // цифры "сколько оценок собрано / сколько нужно", не выдуманный прогресс.
  const scoringRounds = competition.divisions
    .flatMap((d) => d.rounds)
    .filter((r) => r.status === "SCORING" && r.type !== "TIE_BREAK");
  // Финал (FinalSession уже начата) считается своим прогрессом (критерий ×
  // судья), обычные раунды — старым (одна оценка на участника).
  const scoringProgressPromise = Promise.all(
    scoringRounds.map(
      async (r) => [r.id, r.finalSession ? await getFinalScoringProgress(r.id) : await getRoundScoringProgress(r.id)] as const
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
  const divisionResultsPromise = canCalculateResults
    ? Promise.all(
        competition.divisions
          .filter((d) => finalRoundCompletedByDivisionId.get(d.id))
          .map(async (d) => [d.id, await getCurrentDivisionResults(d.id)] as const)
      )
    : Promise.resolve([] as (readonly [string, Awaited<ReturnType<typeof getCurrentDivisionResults>>])[]);

  // DB-002: раньше без `take` вообще — на маленьких тестовых соревнованиях
  // (до ~30 регистраций) незаметно, но на реальном крупном турнире с
  // несколькими сотнями участников этот запрос (плюс вложенные include)
  // рос бы без ограничения на каждой загрузке страницы. Лимит — не полная
  // пагинация (это отдельная UI-фича), а честная защита от неограниченного
  // роста: организатор явно видит, если список обрезан, вместо того чтобы
  // молча получать "первые N по порядку без предупреждения".
  const REGISTRATIONS_DISPLAY_LIMIT = 300;
  const registrationsPromise = canViewAllRegistrations
    ? prisma.registration.findMany({
        where: { competitionId: competition.id },
        relationLoadStrategy: "join",
        include: { dancer: true, checkIn: true, division: { include: { category: true } } },
        orderBy: { createdAt: "asc" },
        take: REGISTRATIONS_DISPLAY_LIMIT,
      })
    : Promise.resolve([]);
  const registrationsTotalCountPromise = canViewAllRegistrations
    ? prisma.registration.count({ where: { competitionId: competition.id } })
    : Promise.resolve(0);
  const myRegistrationPromise =
    !canViewAllRegistrations && myDancer
      ? prisma.registration.findFirst({
          where: { competitionId: competition.id, dancerId: myDancer.id },
          relationLoadStrategy: "join",
          include: { checkIn: true, division: { include: { category: true } } },
        })
      : Promise.resolve(null);
  // DB-002: точечный запрос, а не registrations.some(...) — тот список
  // может быть обрезан лимитом отображения, а эта проверка обязана быть
  // верной независимо от того, попала ли конкретная регистрация в первые
  // REGISTRATIONS_DISPLAY_LIMIT.
  const myRegistrationCountPromise =
    canViewAllRegistrations && myDancer
      ? prisma.registration.count({ where: { competitionId: competition.id, dancerId: myDancer.id } })
      : Promise.resolve(0);

  const [
    registeredCounts,
    checkedInCounts,
    scoringProgressEntries,
    divisionResultEntries,
    registrations,
    registrationsTotalCount,
    myRegistration,
    myRegistrationCount,
  ] = await measureServerOperation("admin.open_competition.rest", () =>
    Promise.all([
      registeredCountsPromise,
      checkedInCountsPromise,
      scoringProgressPromise,
      divisionResultsPromise,
      registrationsPromise,
      registrationsTotalCountPromise,
      myRegistrationPromise,
      myRegistrationCountPromise,
    ])
  );

  const scoringProgressByRoundId = new Map(scoringProgressEntries);
  const divisionResultsById: Map<string, Awaited<ReturnType<typeof getCurrentDivisionResults>>> = new Map(divisionResultEntries);

  const isRegistrationOpen = competition.status === "REGISTRATION_OPEN";
  const alreadyRegistered = canViewAllRegistrations ? myRegistrationCount > 0 : myRegistration !== null;

  // Формы регистрации ждут { id, name } — категория дивизиона теперь и есть
  // его "имя" для пользователя.
  const divisionOptions = competition.divisions.map((d) => ({ id: d.id, name: d.category.name }));

  // Основное — статус/публикация/KPI. Числа берутся из уже загруженных выше
  // данных (без новых запросов): checkedInCount точен только пока список
  // регистраций не обрезан лимитом отображения (REGISTRATIONS_DISPLAY_LIMIT,
  // тот же известный компромисс, что и у самого списка "Участники" ниже).
  const checkedInCount = registrations.filter((r) => r.checkIn !== null).length;
  const kpis = [
    { label: "Участники", value: canViewAllRegistrations ? registrationsTotalCount : registrations.length },
    { label: "Check-in", value: checkedInCount },
    { label: "Категории", value: competition.divisions.length },
    { label: "Судьи", value: competitionJudgePool.length },
  ];

  // Текущий этап — какие раунды прямо сейчас не в состоянии покоя, по
  // каждой категории отдельно (в раунде другой категории может параллельно
  // идти жеребьёвка/подсчёт, пока в этой ротация на паркете — заходы одного
  // СОРЕВНОВАНИЯ эксклюзивны, A4, но раунды разных категорий друг с другом не
  // связаны). Считается из уже загруженного дерева competition.divisions,
  // без дополнительных запросов.
  const ACTIVE_ROUND_STATUSES = new Set(["DRAWING", "DRAW_LOCKED", "RUNNING", "SCORING"]);
  const currentActiveStages = competition.divisions.flatMap((d) =>
    d.rounds
      .filter((r) => ACTIVE_ROUND_STATUSES.has(r.status))
      .map((r) => ({
        divisionName: d.category.name,
        stageName: r.stage?.name ?? (r.type ? ROUND_TYPE_LABELS[r.type] ?? r.type : "—"),
        status: r.status,
      }))
  );

  const overviewContent = (
    <div className="flex flex-col gap-4">
      {canManage && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {kpis.map((k) => (
            <StatCard key={k.label} label={k.label} value={k.value} />
          ))}
        </div>
      )}
      {canManage && <CompetitionStatusControls competitionId={competition.id} status={competition.status} />}
      {canPublishResults && <CompetitionResultsPanel competitionId={competition.id} publicResults={competition.publicResults} />}
      {canManageRounds && (
        <Card className="border-admin-border bg-admin-card">
          <p className="m-0 mb-2 font-semibold text-night-text">Текущий этап</p>
          {currentActiveStages.length === 0 ? (
            <p className="m-0 text-sm text-admin-muted">Нет активных этапов.</p>
          ) : (
            <ul className="m-0 flex flex-col gap-1 pl-4">
              {currentActiveStages.map((s, i) => (
                <li key={i} className="text-sm text-admin-muted">
                  <span className="font-medium text-night-text">{s.divisionName}</span> · {s.stageName} —{" "}
                  {ROUND_STATUS_LABELS[s.status] ?? s.status}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
      {isJudge && (
        <p>
          <a href={`/judging/${competition.id}`}>Моё судейство →</a>
        </p>
      )}
    </div>
  );

  // Прохождение участников по этапам — сколько реальных (scored=true)
  // участников было вызвано на паркет в каждом обычном раунде дивизиона, по
  // порядку. Из уже загруженного дерева competition.divisions, без новых
  // запросов; TIE_BREAK-раунды сюда не входят (это не основной путь по
  // сетке, а отдельная развязка ничьей).
  const advancementFunnels = competition.divisions
    .map((d) => ({
      categoryName: d.category.name,
      stages: d.rounds
        .filter((r) => r.type === null)
        .sort((a, b) => a.order - b.order)
        .map((r) => ({
          name: r.stage?.name ?? "—",
          calledCount: r.heats.reduce((sum, h) => sum + (h.draws[0]?.participants.filter((p) => p.scored).length ?? 0), 0),
        })),
    }))
    .filter((f) => f.stages.length > 0);

  const chartsContent = (
    <div className="flex flex-col gap-4">
      {canManageRounds && advancementFunnels.length > 0 && (
        <Card className="border-admin-border bg-admin-card">
          <p className="m-0 mb-2 font-semibold text-night-text">Прохождение участников по этапам</p>
          <div className="flex flex-col gap-2">
            {advancementFunnels.map((f) => (
              <div key={f.categoryName} className="flex flex-wrap items-center gap-1.5 text-sm">
                <span className="mr-1 font-medium text-night-text">{f.categoryName}:</span>
                {f.stages.map((s, i) => (
                  <span key={i} className="flex items-center gap-1.5 text-admin-muted">
                    {i > 0 && <span className="text-admin-disabled">→</span>}
                    <span className="rounded-full bg-admin-card2 px-2.5 py-1">
                      {s.name} <span className="font-semibold text-night-text">{s.calledCount}</span>
                    </span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </Card>
      )}
      {canViewStatistics ? (
        <StatisticsSection competitionId={competition.id} />
      ) : (
        <p className="text-sm text-admin-muted">Нет доступа к статистике.</p>
      )}
    </div>
  );

  const settingsContent = (
    <div className="flex flex-col gap-4">
      {canEditPublicInfo ? (
        <Card className="border-admin-border bg-admin-card">
          <p className="m-0 mb-1 font-semibold text-night-text">Публичная информация</p>
          <PublicInfoPanel
            competitionId={competition.id}
            info={{
              rulesText: competition.rulesText ?? "",
              rulesUrl: competition.rulesUrl ?? "",
              mediaUrl: competition.mediaUrl ?? "",
            }}
          />
        </Card>
      ) : (
        <p className="text-sm text-admin-muted">Нет доступных настроек.</p>
      )}
      {canManage && (
        <p className="m-0 text-xs text-admin-muted">
          Настройки конкретной категории (вместимость захода, ротация, метод судейства, критерии финала) — на вкладке
          «Категории», у каждой категории отдельно.
        </p>
      )}
      {canDeleteCompetition && (
        <Card className="border-red-400/30 bg-admin-card">
          <p className="m-0 mb-1 font-semibold text-red-400">Опасная зона</p>
          <p className="m-0 mb-3 text-sm text-admin-muted">Необратимое удаление соревнования и всех его данных.</p>
          <DeleteCompetitionButton
            competitionId={competition.id}
            competitionName={competition.name}
            divisionsCount={competition.divisions.length}
            registrationsCount={registrationsTotalCount}
            disabledReason={
              competition.status === "PUBLISHED" || competition.status === "ARCHIVED"
                ? "Результаты уже опубликованы — удаление отключено, история должна сохраняться."
                : null
            }
          />
        </Card>
      )}
    </div>
  );

  // Судьи — общий пул (справочно, кто вообще назначен хоть куда-то, теперь
  // настоящая <table> — redesign 2026-09-09, единый табличный стиль с
  // "Участники"/справочниками, CLAUDE.md §64) и, ниже, "Судейская панель" +
  // "Настройки судейства" на общем сайдбаре категорий (JudgesWorkspace).
  const judgingDivisions: JudgingDivision[] = competition.divisions.map((d) => {
    const finalLocked = d.rounds.some((r) => r.finalSession);
    return {
      id: d.id,
      categoryName: d.category.name,
      leaderJudgeUserIds: d.judgeAssignments.filter((ja) => ja.role === "LEADER").map((ja) => ja.judgeUserId),
      followerJudgeUserIds: d.judgeAssignments.filter((ja) => ja.role === "FOLLOWER").map((ja) => ja.judgeUserId),
      judgingMaxScore: d.judgingMaxScore,
      judgingMaxScoreDisabledReason: !canManage
        ? "Нет прав на изменение."
        : !competitionNotStarted
          ? "Соревнование уже началось — метод менять нельзя."
          : null,
      heatCapacity: d.heatCapacity,
      rotationMode: d.rotationMode,
      rotationIntervalSec: d.rotationIntervalSec,
      rotationShiftMin: d.rotationShiftMin,
      rotationShiftMax: d.rotationShiftMax,
      finalFormat: d.finalSettings?.format ?? "NORMAL",
      finalFormatDisabledReason: !canConfigureFinal ? "Нет прав на изменение." : finalLocked ? "Финал уже начат — формат менять нельзя." : null,
      finalTracksCount: d.finalSettings?.tracksCount ?? 1,
      finalPartnerChangeEnabled: d.finalSettings?.partnerChangeEnabled ?? false,
      finalConfig: d.finalSettings?.config ?? {},
      // Критерии финала — теперь тоже здесь, в "Настройки судейства" (было
      // отдельной формой в удалённом блоке Монитора, 2026-09-09).
      finalCriteria: d.finalCriteria.map((c) => ({
        id: c.id,
        name: c.name,
        priority: c.priority,
        minScore: c.minScore,
        maxScore: c.maxScore,
        step: c.step,
        catalogId: c.catalogId,
      })),
      finalCriteriaCatalog: criterionCatalog.map((c) => ({ id: c.id, name: c.name, minScore: c.minScore, maxScore: c.maxScore, step: c.step })),
    };
  });

  // Реестр судей — теперь плоские данные для клиентского JudgeRegistryPanel
  // (поиск + фильтр "Не назначены" + группировка по роли, редизайн
  // 2026-09-09, см. также JudgesWorkspace/DivisionJudgesPanel). Роль здесь —
  // объединение ролей судьи по всем его назначениям (judgeRoles выше), не
  // отдельное хранимое поле.
  const registryJudges: RegistryJudge[] = competitionJudgePool.map((j) => ({
    judgeUserId: j.judgeUserId,
    displayName: j.displayName,
    judgeEmail: j.judgeEmail,
    categories: judgeDivisionChips.get(j.judgeUserId) ?? [],
    roles: [...(judgeRoles.get(j.judgeUserId) ?? [])],
  }));

  const judgesContent = (
    <div className="flex flex-col gap-4">
      {canAssignJudges && (
        <div className="flex flex-col gap-3">
          <div>
            <h2 className="m-0 text-xl font-extrabold text-night-text">Реестр судей</h2>
            <p className="m-0 mt-1 text-sm text-admin-muted">
              Все судьи, зарегистрированные на соревнование — независимо от того, назначены ли они уже в категорию.
            </p>
          </div>
          <Card className="border-admin-border bg-admin-card">
            <JudgeRegistryPanel
              competitionId={competition.id}
              judges={registryJudges}
              addAction={
                <AddButton label="Добавить судью" gradientClassName="bg-gradient-admin-cta" wide>
                  <AddCompetitionJudgeForm competitionId={competition.id} />
                </AddButton>
              }
            />
          </Card>
        </div>
      )}
      {canAssignJudges ? (
        competition.divisions.length === 0 ? (
          <p className="text-sm text-admin-muted">Категорий пока нет.</p>
        ) : (
          <div className="flex flex-col gap-3">
            <div>
              <h2 className="m-0 text-xl font-extrabold text-night-text">Назначение и настройка по категориям</h2>
              <p className="m-0 mt-1 text-sm text-admin-muted">
                Кто судит какую категорию, по какой методике и с какими критериями — выберите категорию слева.
              </p>
            </div>
            <JudgesWorkspace divisions={judgingDivisions} pool={competitionJudgePool} />
          </div>
        )
      ) : (
        <p className="text-sm text-admin-muted">Нет прав на назначение судей.</p>
      )}
    </div>
  );

  const participantsContent = (
    <div className="flex flex-col gap-4">
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
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="m-0 text-xl font-extrabold text-night-text">Участники</h2>
              <p className="m-0 mt-1 text-sm text-admin-muted">
                Список всех участников текущего соревнования. Вы можете управлять категориями, отмечать check-in и
                отслеживать оплату.
              </p>
            </div>
            {canManageRegistrations && divisionOptions.length > 0 && (
              <AddButton label="Добавить участника" gradientClassName="bg-gradient-admin-cta">
                <AddParticipantPanel competitionId={competition.id} divisions={divisionOptions} />
              </AddButton>
            )}
          </div>
          {registrationsTotalCount > registrations.length && (
            <p className="m-0 mb-2 text-sm text-amber-400">
              Показаны первые {registrations.length} из {registrationsTotalCount} — список обрезан.
            </p>
          )}
          {registrations.length === 0 ? (
            <p className="text-sm text-admin-muted">Пока никто не зарегистрирован.</p>
          ) : (
            <ParticipantsPanel
              registrations={registrations.map((r) => ({
                id: r.id,
                displayName: r.dancer.displayName,
                divisionId: r.divisionId,
                categoryName: r.division.category.name,
                roleLabel: ROLE_LABELS[r.role] ?? r.role,
                status: r.status,
                bibNumber: r.checkIn?.bibNumber ?? null,
                checkedIn: r.checkIn !== null,
                isPaid: r.isPaid,
                noShow: isNoShow({ registrationStatus: r.status, hasCheckIn: r.checkIn !== null, competitionStatus: competition.status }),
                roleOverrideStatus: r.roleOverrideStatus === "PENDING" || r.roleOverrideStatus === "REJECTED" ? r.roleOverrideStatus : null,
                requestedRoleLabel: r.requestedRole ? ROLE_LABELS[r.requestedRole] ?? r.requestedRole : null,
              }))}
              categories={competition.divisions.map((d) => ({ id: d.id, categoryName: d.category.name }))}
              canChangeDivision={canChangeDivision}
              canReviewRoleOverride={canReviewRoleOverride}
              canCheckIn={canCheckIn}
              canManagePayment={canManageRegistrations}
            />
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
                {isNoShow({
                  registrationStatus: myRegistration.status,
                  hasCheckIn: myRegistration.checkIn !== null,
                  competitionStatus: competition.status,
                }) && " · не явился"}
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

  // "Категории" (redesign 2026-09-09, по референсу пользователя) — только
  // сводная таблица + добавление/редактирование (DivisionsOverviewTable).
  // Раунды/жеребьёвка/финал/ротация партнёров живут на вкладке "Монитор"
  // ниже (monitorContent) — их окончательный дом, выбранный пользователем
  // 2026-09-09 взамен прежней временной вкладки "Раунды".
  const divisionOverviewRows: DivisionOverviewRow[] = competition.divisions.map((d) => ({
    id: d.id,
    categoryName: d.category.name,
    heatCapacity: d.heatCapacity,
    rotationMode: d.rotationMode,
    rotationIntervalSec: d.rotationIntervalSec,
    rotationShiftMin: d.rotationShiftMin,
    rotationShiftMax: d.rotationShiftMax,
    judgingMaxScoreLabel: JUDGING_MAX_SCORE_LABELS[d.judgingMaxScore] ?? String(d.judgingMaxScore),
    finalFormatLabel: FINAL_FORMAT_LABELS[d.finalSettings?.format ?? "NORMAL"],
    stagePlan: d.stagePlan.map((p) => ({ stageId: p.stageId, participantCount: p.participantCount })),
    locked: d.rounds.length > 0,
  }));

  const categoriesContent = canManage ? (
    <DivisionsOverviewTable
      competitionId={competition.id}
      divisions={divisionOverviewRows}
      availableCategories={activeCategories.filter((c) => !competition.divisions.some((d) => d.categoryId === c.id))}
      stages={activeStages}
    />
  ) : (
    <p className="text-sm text-admin-muted">Нет прав на управление категориями.</p>
  );

  // Монитор (2026-09-09, по решению пользователя) — единственное рабочее
  // место организатора во время прогона, заменил вкладку "Раунды": вместо
  // сплошного списка всех категорий и всех раундов сразу — выбор
  // категория → этап → заход, с номерами на паркете, жеребьёвкой, вызовом
  // помощника и живым составом судей на одном экране. Сама функциональность
  // не изменилась: те же серверные операции и те же компоненты действий —
  // здесь только собирается модель того, что монитор должен показать, из
  // УЖЕ загруженного выше дерева (ни одного нового запроса).
  const judgeNameByUserId = new Map(competitionJudgePool.map((j) => [j.judgeUserId, j.displayName ?? j.judgeEmail]));

  const monitorCategories: MonitorCategory[] = competition.divisions.map((d) => {
    // Настройки ротации по умолчанию — теперь внутри "Живого танцпола"
    // (за шестерёнкой, RotationPanel), не отдельным блоком (2026-09-09).
    // Формат финала и критерии переехали в "Настройки судейства"
    // (judgingDivisions выше) — здесь для них узла больше нет.
    const rotationSettingsPanel = canManage ? (
      <DivisionSettingsPanel
        divisionId={d.id}
        settings={{
          rotationMode: d.rotationMode,
          rotationIntervalSec: d.rotationIntervalSec,
          rotationShiftMin: d.rotationShiftMin,
          rotationShiftMax: d.rotationShiftMax,
        }}
      />
    ) : null;

    const rounds: MonitorRound[] = !canManageRounds
      ? []
      : d.rounds.map((round) => {
          // Финал — последний по order обычный (не служебный) раунд дивизиона
          // (тот же признак, что и isFinalStageInTx на сервере, advancement.ts).
          const isFinalRound = round.type === null && !d.rounds.some((r) => r.type === null && r.order > round.order);
          const tieGroupConfig = round.config as { finalTieGroupKey?: string; tieBreakKind?: string } | null;
          const isFinalTieBreak = round.type === "TIE_BREAK" && !!tieGroupConfig?.finalTieGroupKey;
          // TIEBREAK-001: перетанцовка "за место" в финале без критериальной
          // системы (никого не отсеивают, нужен только порядок внутри группы).
          const isFullRankTieBreak = round.type === "TIE_BREAK" && tieGroupConfig?.tieBreakKind === "FULL_RANK";
          const isJudgesDance = round.finalSession?.format === "JUDGES_DANCE";
          const isRandomCouples = round.finalSession?.format === "RANDOM_COUPLES";
          const usesCustomFinalFlow = isJudgesDance || isRandomCouples;

          const panels: ReactNode[] = [];

          if (isFinalRound && round.status === "READY" && !round.finalSession && canManageFinal) {
            panels.push(<StartFinalPanel key="start-final" roundId={round.id} />);
          }

          if (isJudgesDance && round.status !== "COMPLETED" && canManageFinal) {
            panels.push(<JudgesDanceStagePanel key="judges-dance" roundId={round.id} currentStage={round.finalSession!.currentStage} />);
          }

          if (isRandomCouples && round.status !== "COMPLETED" && canManageFinal) {
            panels.push(
              <RandomCouplesPanel
                key="random-couples"
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
            );
          }

          if (round.status === "SCORING" && round.type !== "TIE_BREAK") {
            panels.push(
              <div key="scoring-progress">
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
              </div>
            );
          }

          if (round.status === "SCORING" && round.type === "TIE_BREAK" && isFinalTieBreak && canDecideTieBreak) {
            panels.push(
              <FinalTieBreakDecisionForm
                key="final-tie-break"
                tieBreakRoundId={round.id}
                candidates={(round.heats[0]?.draws[0]?.participants ?? [])
                  .filter((p) => p.scored)
                  .map((p) => ({
                    registrationId: p.registrationId,
                    bibNumber: p.registration.checkIn?.bibNumber ?? null,
                    displayName: p.registration.dancer.displayName,
                  }))}
              />
            );
          }

          if (round.status === "SCORING" && round.type === "TIE_BREAK" && !isFinalTieBreak && canDecideTieBreak) {
            panels.push(
              <TieBreakDecisionForm
                key="tie-break"
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
            );
          }

          if ((round.status === "SCORING" || round.status === "COMPLETED") && round.finalSession && round.finalResults.length > 0) {
            panels.push(
              <FinalResultsTable
                key="final-results"
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
            );
          }

          if (round.status === "COMPLETED" && !round.finalSession && round.results.length > 0) {
            panels.push(
              <div key="round-results" className="grid grid-cols-2 gap-3">
                {(["LEADER", "FOLLOWER"] as const).map((r) => (
                  <div key={r}>
                    <p className="hint-text">{ROLE_LABELS_PLURAL[r] ?? r}</p>
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
            );
          }

          if (round.status === "COMPLETED" && round.type !== "TIE_BREAK" && !isFinalRound && canPublishResults) {
            panels.push(
              <RoundAdvancementPublish
                key="advancement-publish"
                roundId={round.id}
                publishedAt={round.advancementPublishedAt ? round.advancementPublishedAt.toISOString() : null}
              />
            );
          }

          if (isJudgesDance) {
            // JUDGES_DANCE не использует Draw Engine (партнёр участника — судья,
            // не другой финалист, A5) — заходы управляются целиком через
            // JudgesDanceStagePanel выше, здесь только read-only список
            // вызванных по стадиям.
            panels.push(
              <div key="judges-dance-stages" className="stack gap-1.5">
                {round.heats.map((heat) => (
                  <div key={heat.id}>
                    <p className="hint-text m-0">
                      Стадия {heat.number} ({heat.number === 1 ? "Партнёры" : "Партнёрши"}) ·{" "}
                      {HEAT_STATUS_LABELS[heat.status] ?? heat.status}
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
            );
          }

          if (isRandomCouples) {
            // Список пар уже виден в RandomCouplesPanel выше (с именами/треком)
            // — здесь только статус захода каждой пары, для контроля "кто
            // сейчас танцует".
            panels.push(
              <div key="random-couples-heats" className="stack gap-1.5">
                {round.heats.map((heat) => (
                  <p key={heat.id} className="hint-text m-0">
                    Пара {heat.number} · {HEAT_STATUS_LABELS[heat.status] ?? heat.status}
                  </p>
                ))}
              </div>
            );
          }

          const heats: MonitorHeat[] = round.heats.map((heat) => {
            const draw = heat.draws[0];
            const participants = draw?.participants ?? [];
            const leaderCount = participants.filter((p) => p.role === "LEADER").length;
            const followerCount = participants.filter((p) => p.role === "FOLLOWER").length;
            // "Разбить" смотрит на РЕАЛЬНЫЙ (не считая помощников) дисбаланс —
            // доступно, даже если помощники уже сгладили общее число, это
            // альтернативный способ, не зависящий от них. Если меньшая
            // сторона — 0 реальных участников, разбивка унесла бы их всех в
            // новый заезд и текущий остался бы пустым (сервер такое тоже
            // отклонит, 2026-09-04).
            const scoredLeaderCount = participants.filter((p) => p.role === "LEADER" && p.scored).length;
            const scoredFollowerCount = participants.filter((p) => p.role === "FOLLOWER" && p.scored).length;
            const toMonitorParticipant = (p: (typeof participants)[number]): MonitorParticipant => ({
              id: p.id,
              bibNumber: p.registration.checkIn?.bibNumber ?? null,
              displayName: p.registration.dancer.displayName,
              isHelper: !p.scored,
              helperCategoryName: p.scored ? null : p.registration.division.category.name,
            });
            return {
              id: heat.id,
              number: heat.number,
              status: heat.status,
              leaders: participants.filter((p) => p.role === "LEADER").map(toMonitorParticipant),
              followers: participants.filter((p) => p.role === "FOLLOWER").map(toMonitorParticipant),
              hasDraw: !!draw,
              drawVersion: draw?.version ?? null,
              drawSeed: draw?.seed ?? null,
              canEditDraw: round.status === "DRAWING" && heat.status === "PENDING" && !!draw,
              // Кого звать в помощь — определяется по факту (какой стороны
              // сейчас меньше в списке), а не выбором организатора: если уже
              // поровну, помощь не нужна вообще (docs/00_DECISIONS.md,
              // 2026-09-04).
              neededRole: leaderCount === followerCount ? null : leaderCount < followerCount ? "LEADER" : "FOLLOWER",
              hasRealImbalance: scoredLeaderCount !== scoredFollowerCount && Math.min(scoredLeaderCount, scoredFollowerCount) > 0,
              // Та же узкая область, что и на сервере (create-heat.ts,
              // deleteHeat) — только пустой PENDING-заход без жеребьёвки.
              canDelete: heat.status === "PENDING" && !draw,
            };
          });

          const calledOf = (role: RegistrationRole) =>
            round.heats.reduce(
              (sum, h) => sum + (h.draws[0]?.participants.filter((p) => p.scored && p.role === role).length ?? 0),
              0
            );

          return {
            id: round.id,
            name: round.stage?.name ?? (round.type ? (ROUND_TYPE_LABELS[round.type] ?? round.type) : "—"),
            status: round.status,
            finalistsCount: round.finalistsCount,
            isFinalRound,
            isTieBreak: round.type === "TIE_BREAK",
            judgingMethodLabel: JUDGING_MAX_SCORE_LABELS[round.judgingMaxScore] ?? String(round.judgingMaxScore),
            finalFormatLabel: isFinalRound ? FINAL_FORMAT_LABELS[d.finalSettings?.format ?? "NORMAL"] : null,
            showsHeats: !usesCustomFinalFlow,
            // После DRAW_LOCKED у каждого захода уже обязана быть жеребьёвка
            // (round-state.ts) — новый заход без списка нарушил бы это.
            canAddHeat:
              !usesCustomFinalFlow && (round.status === "DRAFT" || round.status === "READY" || round.status === "DRAWING"),
            // Финал обязан пройти через "Начать финал" (StartFinalPanel) — та
            // фиксирует критерии в FinalSession, до этого жеребьёвка не должна
            // быть доступна вообще ни одной кнопкой: иначе раунд может уйти в
            // RUNNING по обычному пути, без FinalSession, и судьи увидят
            // обычную схему Да/Нет вместо критериев (найдено на живом
            // тестировании, 2026-09-05).
            showStartDrawing: !usesCustomFinalFlow && round.status === "READY" && (!isFinalRound || !!round.finalSession),
            // Перетанцовка "за место" (FULL_RANK/RANK_ALL, TIEBREAK-001/A22) —
            // судьи её больше не оценивают вовсе (rolesNotNeedingJudging,
            // 2026-09-07): решение вносит HEAD_JUDGE вручную, монитору
            // судейских оценок для неё нечего показывать.
            scoreMonitorHref:
              canViewScoreMonitor && !(round.type === "TIE_BREAK" && (isFullRankTieBreak || isFinalTieBreak))
                ? `/admin/competitions/${competition.id}/score-monitor/${round.id}`
                : null,
            calledLeaders: calledOf("LEADER"),
            calledFollowers: calledOf("FOLLOWER"),
            heats,
            panels,
          };
        });

    const judgesOf = (role: RegistrationRole): MonitorJudge[] =>
      d.judgeAssignments
        .filter((ja) => ja.role === role)
        .map((ja) => ({
          judgeAssignmentId: ja.id,
          judgeUserId: ja.judgeUserId,
          displayName: judgeNameByUserId.get(ja.judgeUserId) ?? "—",
        }));

    return {
      id: d.id,
      name: d.category.name,
      order: d.category.order,
      registeredLeaders: countFor(registeredCounts, d.id, "LEADER"),
      registeredFollowers: countFor(registeredCounts, d.id, "FOLLOWER"),
      checkedInLeaders: countFor(checkedInCounts, d.id, "LEADER"),
      checkedInFollowers: countFor(checkedInCounts, d.id, "FOLLOWER"),
      stagePlanLabel:
        d.stagePlan.length === 0 ? null : d.stagePlan.map((p) => `${p.stage.name} ${p.participantCount}`).join(" · "),
      judges: { leaders: judgesOf("LEADER"), followers: judgesOf("FOLLOWER") },
      rounds,
      rotationSettingsPanel,
      results: canCalculateResults ? (
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
      ) : null,
      generateRounds: canManageRounds ? <GenerateRoundsButton divisionId={d.id} hasExistingRounds={d.rounds.length > 0} /> : null,
    };
  });

  const monitorContent = (
    <div className="flex flex-col gap-4">
      {!canManageRounds && (
        <p className="m-0 text-sm text-admin-muted">Нет прав на управление раундами — показаны только настройки категорий.</p>
      )}
      <CompetitionMonitor categories={monitorCategories} canViewScoreMonitor={canViewScoreMonitor} />
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      <CompetitionHeader
        name={competition.name}
        status={competition.status}
        cityName={competition.city?.nameRu ?? null}
        venue={competition.venue}
        startAt={competition.startAt}
      />
      {/* Suspense — CompetitionWorkspaceTabs и вложенный в него CompetitionMonitor
          читают useSearchParams() (возврат со страницы "Монитор оценок судей"
          на ту же вкладку/категорию/этап, 2026-09-09); Next.js требует
          Suspense-границу вокруг любого потребителя useSearchParams. */}
      <Suspense fallback={null}>
        <CompetitionWorkspaceTabs
          tabs={[
            { id: "overview", label: "Основное", content: overviewContent },
            { id: "categories", label: "Категории", content: categoriesContent },
            { id: "monitor", label: "Монитор", content: monitorContent },
            { id: "participants", label: "Участники", content: participantsContent },
            { id: "judges", label: "Судьи", content: judgesContent },
            { id: "charts", label: "Графики", content: chartsContent },
            { id: "settings", label: "Настройки", content: settingsContent },
          ]}
        />
      </Suspense>
    </div>
  );
}
