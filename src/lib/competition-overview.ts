import type { HeatStatus, RoundStatus, RoundType } from "@prisma/client";
import { HEAT_STATUS_LABELS } from "@/lib/competition-labels";

// Чистые (без БД) вычисления для вкладки "Главная" ("Текущее соревнование" →
// главный экран организатора) — тот же приём, что и в
// components/admin/monitor/selection.ts: минимальные "*Like"-типы вместо
// полных Prisma-моделей, чтобы функции были тестируемы без БД и без риска
// продублировать реальную бизнес-логику подсчёта/advancement/tie-break
// (CLAUDE.md §48/§53) — здесь только ЧТЕНИЕ уже принятых сервером решений
// (round.status/type, DrawParticipant.scored), никаких новых вычислений
// результатов.

export type OverviewParticipant = {
  registrationId: string;
  role: "LEADER" | "FOLLOWER";
  scored: boolean;
  bibNumber: string | null;
  displayName: string;
};

export type OverviewHeat = {
  id: string;
  number: number;
  status: HeatStatus;
  participants: OverviewParticipant[];
};

export type OverviewRound = {
  id: string;
  type: RoundType | null;
  status: RoundStatus;
  order: number;
  stageLabel: string;
  judgingFormatLabel: string;
  finalistsCount: number | null;
  advancementPublishedAt: Date | null;
  // Снимок Round.config — на нём же строится различение
  // FULL_RANK/финального tie-break и в page.tsx (TieBreakDecisionForm/
  // FinalTieBreakDecisionForm), см. docs/03 (TIEBREAK-001).
  config: { finalTieGroupKey?: string; tieBreakKind?: string } | null;
  heats: OverviewHeat[];
};

export type OverviewDivision = {
  id: string;
  categoryName: string;
  categoryColor: string;
  leaderJudgesCount: number;
  followerJudgesCount: number;
  rounds: OverviewRound[];
};

export type ScoringProgress = { submitted: number; required: number };

export type FloorSpotlight = {
  divisionId: string;
  roundId: string;
  heatId: string;
  categoryName: string;
  categoryColor: string;
  stageLabel: string;
  heatNumber: number;
  heatsTotal: number;
  judgingFormatLabel: string;
  judgesAssignedCount: number;
  leaders: { bibNumber: string | null; displayName: string }[];
  followers: { bibNumber: string | null; displayName: string }[];
  scoring: ScoringProgress | null;
  heatStatusLabel: string;
  monitorHref: string;
};

export type PendingTieBreakRow = {
  roundId: string;
  divisionId: string;
  categoryName: string;
  categoryColor: string;
  stageLabel: string;
  candidates: { registrationId: string; bibNumber: string | null; displayName: string }[];
  // null — для FINAL/FULL_RANK: там нет простого "N мест", решение судей не
  // про отсев, а про порядок/место (CLAUDE.md §21, TIEBREAK-001).
  freeSlots: number | null;
  kind: "SELECT_N" | "FINAL" | "FULL_RANK";
  monitorHref: string;
};

export type ActiveCategoryRow = {
  divisionId: string;
  roundId: string;
  categoryName: string;
  categoryColor: string;
  statusVariant: "blue" | "amber" | "red" | "green";
  statusLabel: string;
  detail: string;
  monitorHref: string;
};

export type NextUpItem = {
  priority: "p1" | "p2" | "p3";
  title: string;
  detail: string;
  monitorHref: string;
};

const FLOOR_HEAT_STATUSES: HeatStatus[] = ["RUNNING", "PAUSED"];
const ACTIVE_ROUND_STATUSES: RoundStatus[] = ["DRAWING", "DRAW_LOCKED", "RUNNING", "SCORING"];

export function buildMonitorHref(
  competitionId: string,
  params: { divisionId: string; roundId?: string; heatId?: string }
): string {
  const qs = new URLSearchParams({ tab: "monitor", category: params.divisionId });
  if (params.roundId) qs.set("round", params.roundId);
  if (params.heatId) qs.set("heat", params.heatId);
  return `/admin/competitions/${competitionId}?${qs.toString()}`;
}

// "Заход N из M" — N это номер первого ещё не завершённого захода, либо M
// (общее число), если все уже завершены. Не привязано к тому, идёт ли сейчас
// реально танец — просто прогресс раунда по заходам.
export function heatProgressLabel(heats: { status: HeatStatus }[]): string {
  if (heats.length === 0) return "—";
  const currentIndex = heats.findIndex((h) => h.status !== "FINISHED");
  const current = currentIndex === -1 ? heats.length : currentIndex + 1;
  return `Заход ${current} из ${heats.length}`;
}

// Кто реально сейчас на паркете — единственный заход во всём соревновании,
// у которого статус RUNNING (в приоритете) либо PAUSED (заходы одного
// соревнования эксклюзивны на паркете, см. комментарий в page.tsx). Если
// такого нет — на паркете сейчас никого нет, паузу между заходами показывать
// не нужно (спотлайт просто не рендерится).
export function findFloorSpotlight(
  competitionId: string,
  divisions: OverviewDivision[],
  scoringProgressByRoundId: Map<string, ScoringProgress>
): FloorSpotlight | null {
  for (const status of FLOOR_HEAT_STATUSES) {
    for (const division of divisions) {
      for (const round of division.rounds) {
        const heat = round.heats.find((h) => h.status === status);
        if (!heat) continue;
        const leaders = heat.participants.filter((p) => p.scored && p.role === "LEADER");
        const followers = heat.participants.filter((p) => p.scored && p.role === "FOLLOWER");
        return {
          divisionId: division.id,
          roundId: round.id,
          heatId: heat.id,
          categoryName: division.categoryName,
          categoryColor: division.categoryColor,
          stageLabel: round.stageLabel,
          heatNumber: heat.number,
          heatsTotal: round.heats.length,
          judgingFormatLabel: round.judgingFormatLabel,
          judgesAssignedCount: division.leaderJudgesCount + division.followerJudgesCount,
          leaders: leaders.map((p) => ({ bibNumber: p.bibNumber, displayName: p.displayName })),
          followers: followers.map((p) => ({ bibNumber: p.bibNumber, displayName: p.displayName })),
          scoring: round.status === "SCORING" ? (scoringProgressByRoundId.get(round.id) ?? { submitted: 0, required: 0 }) : null,
          heatStatusLabel: HEAT_STATUS_LABELS[heat.status] ?? heat.status,
          monitorHref: buildMonitorHref(competitionId, { divisionId: division.id, roundId: round.id, heatId: heat.id }),
        };
      }
    }
  }
  return null;
}

// Раунды в статусе SCORING/type=TIE_BREAK — сервер УЖЕ решил, что ничья на
// границе прохождения требует отдельного раунда (advancement.ts,
// CLAUDE.md §19/§23); здесь только достаём уже принятое решение и кандидатов
// для отображения, без пересчёта.
export function collectPendingTieBreaks(competitionId: string, divisions: OverviewDivision[]): PendingTieBreakRow[] {
  const rows: PendingTieBreakRow[] = [];
  for (const division of divisions) {
    for (const round of division.rounds) {
      if (round.type !== "TIE_BREAK" || round.status !== "SCORING") continue;
      const isFinal = !!round.config?.finalTieGroupKey;
      const isFullRank = round.config?.tieBreakKind === "FULL_RANK";
      const candidates = (round.heats[0]?.participants ?? [])
        .filter((p) => p.scored)
        .map((p) => ({ registrationId: p.registrationId, bibNumber: p.bibNumber, displayName: p.displayName }));
      rows.push({
        roundId: round.id,
        divisionId: division.id,
        categoryName: division.categoryName,
        categoryColor: division.categoryColor,
        stageLabel: round.stageLabel,
        candidates,
        freeSlots: isFinal || isFullRank ? null : (round.finalistsCount ?? 0),
        kind: isFinal ? "FINAL" : isFullRank ? "FULL_RANK" : "SELECT_N",
        monitorHref: buildMonitorHref(competitionId, { divisionId: division.id, roundId: round.id }),
      });
    }
  }
  return rows;
}

// Всё, что сейчас "в работе" параллельно паркету (жеребьёвка/подсчёт баллов
// другой категории и т.п.) — та же граница активности, что и в
// components/admin/monitor/selection.ts (hasActiveRound), но с деталями для
// отображения, а не для выбора вкладки по умолчанию. Раунд, показанный в
// спотлайте (floorRoundId), сюда не попадает — он уже показан крупно.
export function collectOtherActiveCategories(
  competitionId: string,
  divisions: OverviewDivision[],
  scoringProgressByRoundId: Map<string, ScoringProgress>,
  floorRoundId: string | null
): ActiveCategoryRow[] {
  const rows: ActiveCategoryRow[] = [];
  for (const division of divisions) {
    for (const round of division.rounds) {
      if (round.id === floorRoundId) continue;
      if (round.type === "TIE_BREAK") {
        if (round.status !== "SCORING") continue;
        rows.push({
          divisionId: division.id,
          roundId: round.id,
          categoryName: division.categoryName,
          categoryColor: division.categoryColor,
          statusVariant: "red",
          statusLabel: "Tie-Break",
          detail: "Ожидает решения судей",
          monitorHref: buildMonitorHref(competitionId, { divisionId: division.id, roundId: round.id }),
        });
        continue;
      }
      if (!ACTIVE_ROUND_STATUSES.includes(round.status)) continue;
      const progress = round.status === "SCORING" ? scoringProgressByRoundId.get(round.id) : undefined;
      const detail =
        round.status === "SCORING" && progress
          ? `${heatProgressLabel(round.heats)} · собрано ${progress.submitted} из ${progress.required}`
          : heatProgressLabel(round.heats);
      rows.push({
        divisionId: division.id,
        roundId: round.id,
        categoryName: division.categoryName,
        categoryColor: division.categoryColor,
        statusVariant: round.status === "SCORING" ? "blue" : "blue",
        statusLabel:
          round.status === "DRAWING" || round.status === "DRAW_LOCKED"
            ? "Жеребьёвка"
            : round.status === "RUNNING"
              ? "Идёт"
              : "Судейство",
        detail,
        monitorHref: buildMonitorHref(competitionId, { divisionId: division.id, roundId: round.id }),
      });
    }
  }
  return rows;
}

// "Что дальше" — приоритизированный список действий организатора, целиком
// из уже загруженных данных (без домыслов о том, чего в модели нет — напр.
// "не хватает судьи" не считаем, т.к. требуемое число судей нигде не
// хранится, CLAUDE.md §19 "не додумывай молча").
export function collectNextUpItems(
  competitionId: string,
  divisions: OverviewDivision[],
  scoringProgressByRoundId: Map<string, ScoringProgress>,
  canPublishResults: boolean
): NextUpItem[] {
  const p1: NextUpItem[] = [];
  const p2: NextUpItem[] = [];
  const p3: NextUpItem[] = [];

  for (const division of divisions) {
    const rounds = division.rounds;
    for (const round of rounds) {
      const href = buildMonitorHref(competitionId, { divisionId: division.id, roundId: round.id });

      if (round.type === "TIE_BREAK" && round.status === "SCORING") {
        const isFinal = !!round.config?.finalTieGroupKey;
        const isFullRank = round.config?.tieBreakKind === "FULL_RANK";
        const count = (round.heats[0]?.participants ?? []).filter((p) => p.scored).length;
        p1.push({
          priority: "p1",
          title: `Провести Tie-Break — ${division.categoryName}`,
          detail:
            isFinal || isFullRank
              ? "Требуется решение судей по местам"
              : `${count} участников, ${round.finalistsCount ?? 0} мест`,
          monitorHref: href,
        });
        continue;
      }

      if (round.status === "SCORING" && round.type !== "TIE_BREAK") {
        const progress = scoringProgressByRoundId.get(round.id);
        if (progress && progress.submitted < progress.required) {
          p2.push({
            priority: "p2",
            title: `Дособрать оценки — ${division.categoryName}`,
            detail: `${heatProgressLabel(round.heats)}: собрано ${progress.submitted} из ${progress.required}`,
            monitorHref: href,
          });
        }
        continue;
      }

      const isFinalRound = round.type === null && !rounds.some((r) => r.type === null && r.order > round.order);
      if (round.status === "COMPLETED" && round.type !== "TIE_BREAK" && !isFinalRound && !round.advancementPublishedAt) {
        if (canPublishResults) {
          p2.push({
            priority: "p2",
            title: `Опубликовать результаты — ${division.categoryName}`,
            detail: `${round.stageLabel} завершён, прошедшие определены`,
            monitorHref: href,
          });
        }
        continue;
      }

      if (round.status === "DRAWING" || round.status === "DRAW_LOCKED") {
        p3.push({
          priority: "p3",
          title: `Жеребьёвка — ${division.categoryName}`,
          detail: heatProgressLabel(round.heats),
          monitorHref: href,
        });
      }
    }
  }

  return [...p1, ...p2, ...p3];
}
