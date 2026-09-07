import type { RegistrationRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ROUND_TYPE_LABELS } from "@/lib/competition-labels";

// Публичное представление соревнования (Этап 12, CLAUDE.md §42) — НАМЕРЕННО
// отдельный модуль от admin-сервисов: явный allowlist полей, без RBAC (это
// то, что видит зритель без логина), чтобы случайно не потащить наружу
// приватные данные (email, аудит и т.п.) через переиспользование admin-select'ов.
// DRAFT-соревнования скрыты (как и на карточке /compete/[id] уже было).

export type PublicDivisionSummary = { id: string; categoryName: string; registrationsCount: number };
export type PublicJudge = { displayName: string };
export type PublicRosterRow = {
  divisionCategoryName: string;
  role: RegistrationRole;
  displayName: string;
  bibNumber: string | null;
};
export type PublicFinalistGroup = { roundLabel: string; divisionCategoryName: string; rows: PublicRosterRow[] };
export type PublicResultRow = PublicRosterRow & { status: "FINALIST" | "ELIMINATED"; placement: number | null };
export type PublicLiveStatus = { heatId: string; heatNumber: number; roundLabel: string; divisionCategoryName: string } | null;

// Прогресс по раундам одной категории (2026-09-07, по запросу пользователя)
// — колонки: реальные раунды дивизиона (TIE_BREAK не в счёт, как и везде,
// см. isFinalStageInTx), в порядке order; последняя колонка — финал.
// Ячейка = null, пока результат ЭТОГО раунда не опубликован организатором
// (для промежуточных раундов — Round.advancementPublishedAt/RoundResult; для
// финала — Competition.publicResults/Result, ровно тот же гейт, что и в
// resultsPublished/results выше — не изобретаем новое правило публикации).
// "ADVANCED" используется единообразно и для промежуточного отсева
// (RoundResult.status===ADVANCED), и для финального FINALIST — для
// зрителя это один и тот же смысл "прошёл этот раунд".
export type PublicRoundProgressStatus = "ADVANCED" | "ELIMINATED" | null;
export type PublicDivisionProgressColumn = { roundId: string; label: string; isFinal: boolean };
export type PublicDivisionProgressRow = PublicRosterRow & { cells: Record<string, PublicRoundProgressStatus> };
export type PublicDivisionProgress = { divisionId: string; columns: PublicDivisionProgressColumn[]; rows: PublicDivisionProgressRow[] };

export type PublicCompetitionView = {
  id: string;
  name: string;
  status: string;
  description: string | null;
  organizerName: string | null;
  venue: string | null;
  cityName: string | null;
  startAt: Date | null;
  endAt: Date | null;
  photoUrl: string | null;
  rulesText: string | null;
  rulesUrl: string | null;
  mediaUrl: string | null;
  divisions: PublicDivisionSummary[];
  judges: PublicJudge[];
  liveStatus: PublicLiveStatus;
  finalistGroups: PublicFinalistGroup[];
  resultsPublished: boolean;
  results: PublicResultRow[];
  divisionProgress: PublicDivisionProgress[];
  stats: { registrationsCount: number; leadersCount: number; followersCount: number; divisionsCount: number };
};

export function roundLabel(round: { stage: { name: string } | null; type: string | null }): string {
  return round.stage?.name ?? (round.type ? ROUND_TYPE_LABELS[round.type] ?? round.type : "Раунд");
}

export async function getPublicCompetitionView(competitionId: string): Promise<PublicCompetitionView | null> {
  const competition = await prisma.competition.findUnique({
    where: { id: competitionId },
    select: {
      id: true,
      name: true,
      description: true,
      organizerName: true,
      venue: true,
      status: true,
      startAt: true,
      endAt: true,
      publicResults: true,
      rulesText: true,
      rulesUrl: true,
      mediaUrl: true,
      city: { select: { nameRu: true } },
      event: { select: { photoUrl: true } },
    },
  });
  if (!competition || competition.status === "DRAFT") return null;

  const [divisions, judgeAssignments, activeHeat, publishedRounds, resultRows, registrationsByRole, progressRounds, progressRegistrations] = await Promise.all([
    prisma.division.findMany({
      where: { competitionId },
      select: {
        id: true,
        category: { select: { name: true } },
        _count: { select: { registrations: { where: { status: "REGISTERED" } } } },
      },
      orderBy: { category: { order: "asc" } },
    }),
    prisma.judgeAssignment.findMany({
      where: { division: { competitionId } },
      select: { judgeUserId: true, judge: { select: { dancer: { select: { displayName: true } } } } },
      distinct: ["judgeUserId"],
    }),
    prisma.heat.findFirst({
      where: { round: { division: { competitionId } }, status: { in: ["RUNNING", "PAUSED"] } },
      select: {
        id: true,
        number: true,
        round: { select: { type: true, stage: { select: { name: true } }, division: { select: { category: { select: { name: true } } } } } },
      },
    }),
    prisma.round.findMany({
      where: { division: { competitionId }, advancementPublishedAt: { not: null } },
      select: {
        type: true,
        stage: { select: { name: true } },
        division: { select: { category: { select: { name: true } } } },
        results: {
          where: { status: "ADVANCED" },
          select: {
            registration: {
              select: { role: true, dancer: { select: { displayName: true } }, checkIn: { select: { bibNumber: true } } },
            },
          },
        },
      },
    }),
    competition.publicResults
      ? prisma.result.findMany({
          where: { division: { competitionId } },
          orderBy: { version: "desc" },
          select: {
            divisionId: true,
            registrationId: true,
            version: true,
            status: true,
            placement: true,
            division: { select: { category: { select: { name: true } } } },
            registration: {
              select: { role: true, dancer: { select: { displayName: true } }, checkIn: { select: { bibNumber: true } } },
            },
          },
        })
      : Promise.resolve([]),
    prisma.registration.groupBy({ by: ["role"], where: { competitionId, status: "REGISTERED" }, _count: { _all: true } }),
    // Раунды для таблицы прогресса по категориям (2026-09-07) — только
    // "настоящие" раунды организатора (type: null — TIE_BREAK не отдельная
    // публичная колонка, решение перетанцовки уже отражено в RoundResult
    // родительского раунда, как и в publishRoundAdvancement).
    prisma.round.findMany({
      where: { division: { competitionId }, type: null },
      orderBy: [{ divisionId: "asc" }, { order: "asc" }],
      select: {
        id: true,
        divisionId: true,
        stage: { select: { name: true } },
        advancementPublishedAt: true,
        results: { select: { registrationId: true, status: true } },
      },
    }),
    prisma.registration.findMany({
      where: { competitionId, status: "REGISTERED" },
      select: {
        id: true,
        divisionId: true,
        role: true,
        dancer: { select: { displayName: true } },
        checkIn: { select: { bibNumber: true } },
      },
    }),
  ]);

  const judges: PublicJudge[] = judgeAssignments
    .map((a) => a.judge.dancer?.displayName)
    .filter((name): name is string => !!name)
    .sort((a, b) => a.localeCompare(b))
    .map((displayName) => ({ displayName }));

  const finalistGroups: PublicFinalistGroup[] = publishedRounds
    .filter((r) => r.results.length > 0)
    .map((r) => ({
      roundLabel: roundLabel(r),
      divisionCategoryName: r.division.category.name,
      rows: r.results.map((rr) => ({
        divisionCategoryName: r.division.category.name,
        role: rr.registration.role,
        displayName: rr.registration.dancer.displayName,
        bibNumber: rr.registration.checkIn?.bibNumber ?? null,
      })),
    }));

  const latestResultByKey = new Map<string, (typeof resultRows)[number]>();
  for (const r of resultRows) {
    const key = `${r.divisionId}:${r.registrationId}`;
    if (!latestResultByKey.has(key)) latestResultByKey.set(key, r);
  }
  const results: PublicResultRow[] = [...latestResultByKey.values()].map((r) => ({
    divisionCategoryName: r.division.category.name,
    role: r.registration.role,
    displayName: r.registration.dancer.displayName,
    bibNumber: r.registration.checkIn?.bibNumber ?? null,
    status: r.status,
    placement: r.placement,
  }));

  const progressRoundsByDivision = new Map<string, (typeof progressRounds)>();
  for (const r of progressRounds) {
    const arr = progressRoundsByDivision.get(r.divisionId) ?? [];
    arr.push(r);
    progressRoundsByDivision.set(r.divisionId, arr);
  }

  const divisionProgress: PublicDivisionProgress[] = divisions.map((d) => {
    const rounds = progressRoundsByDivision.get(d.id) ?? []; // уже отсортированы по order запросом выше
    const finalRoundId = rounds.length > 0 ? rounds[rounds.length - 1].id : null;
    const columns: PublicDivisionProgressColumn[] = rounds.map((r, idx) => ({
      roundId: r.id,
      label: roundLabel({ stage: r.stage, type: null }),
      isFinal: idx === rounds.length - 1,
    }));
    const rows: PublicDivisionProgressRow[] = progressRegistrations
      .filter((reg) => reg.divisionId === d.id)
      .map((reg) => {
        const cells: Record<string, PublicRoundProgressStatus> = {};
        for (const r of rounds) {
          if (r.id === finalRoundId) {
            const result = latestResultByKey.get(`${d.id}:${reg.id}`);
            cells[r.id] = result ? (result.status === "FINALIST" ? "ADVANCED" : "ELIMINATED") : null;
          } else if (r.advancementPublishedAt) {
            const rr = r.results.find((x) => x.registrationId === reg.id);
            cells[r.id] = rr ? (rr.status === "ADVANCED" ? "ADVANCED" : "ELIMINATED") : null;
          } else {
            cells[r.id] = null;
          }
        }
        return {
          divisionCategoryName: d.category.name,
          role: reg.role,
          displayName: reg.dancer.displayName,
          bibNumber: reg.checkIn?.bibNumber ?? null,
          cells,
        };
      });
    return { divisionId: d.id, columns, rows };
  });

  const countByRole = (role: RegistrationRole) => registrationsByRole.find((r) => r.role === role)?._count._all ?? 0;
  const leadersCount = countByRole("LEADER");
  const followersCount = countByRole("FOLLOWER");

  return {
    id: competition.id,
    name: competition.name,
    status: competition.status,
    description: competition.description,
    organizerName: competition.organizerName,
    venue: competition.venue,
    cityName: competition.city?.nameRu ?? null,
    startAt: competition.startAt,
    endAt: competition.endAt,
    photoUrl: competition.event?.photoUrl ?? null,
    rulesText: competition.rulesText,
    rulesUrl: competition.rulesUrl,
    mediaUrl: competition.mediaUrl,
    divisions: divisions.map((d) => ({ id: d.id, categoryName: d.category.name, registrationsCount: d._count.registrations })),
    judges,
    liveStatus: activeHeat
      ? {
          heatId: activeHeat.id,
          heatNumber: activeHeat.number,
          roundLabel: roundLabel(activeHeat.round),
          divisionCategoryName: activeHeat.round.division.category.name,
        }
      : null,
    finalistGroups,
    divisionProgress,
    resultsPublished: competition.publicResults,
    results,
    stats: {
      registrationsCount: leadersCount + followersCount,
      leadersCount,
      followersCount,
      divisionsCount: divisions.length,
    },
  };
}
