"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { CompetitionStatistics } from "@/server/statistics/competition-statistics";
import type { JudgeStatistics } from "@/server/statistics/judge-statistics";
import type { TopFinalParticipant } from "@/server/statistics/judging-analytics";
import { CompetitionStatisticsPanel } from "./CompetitionStatisticsPanel";
import { JudgeStatisticsPanel } from "./JudgeStatisticsPanel";
import { TopParticipantsPanel } from "./TopParticipantsPanel";
import { JudgingAnalyticsPanel, type JudgingAnalyticsData } from "./JudgingAnalyticsPanel";

type BasicData = { competition: CompetitionStatistics; judges: JudgeStatistics[]; topFinalParticipants: TopFinalParticipant[] };
type Tab = "competition" | "judging";

// Статистика загружается по кнопке, а не вместе с карточкой соревнования.
// Причина — производительность, замеренная на живых данных (2026-09-08):
// два свода статистики стоили 12 SQL-запросов из 29 на странице и
// пересчитывались после КАЖДОГО действия организатора (router.refresh()).
// Во время живого соревнования это самая горячая страница, а аналитика на
// ней нужна изредка.
//
// Две вкладки (2026-09-11, по прямому запросу пользователя) — "для
// руководителя" и "для главного судьи" смешивались в один экран, хотя
// решают разные задачи. Тяжёлая часть аналитики судейства (распределение
// оценок/споры между судьями/профиль критериев — читает ВСЕ JudgeScore и
// FinalJudgeScore соревнования) загружается ОТДЕЛЬНО и только при первом
// открытии вкладки "Аналитика судейства" — тот же принцип экономии
// round-trip'ов, что и у самой кнопки "Показать статистику" (A30).
export function StatisticsSection({ competitionId }: { competitionId: string }) {
  const [data, setData] = useState<BasicData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("competition");

  const [judgingAnalytics, setJudgingAnalytics] = useState<JudgingAnalyticsData | null>(null);
  const [judgingLoading, setJudgingLoading] = useState(false);
  const [judgingError, setJudgingError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/competitions/${competitionId}/statistics`);
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Не удалось загрузить статистику.");
        return;
      }
      setData({ competition: json.competition, judges: json.judges, topFinalParticipants: json.topFinalParticipants });
    } catch {
      setError("Не удалось загрузить статистику — проверьте соединение.");
    } finally {
      setLoading(false);
    }
  }

  async function openJudgingTab() {
    setTab("judging");
    if (judgingAnalytics || judgingLoading) return;
    setJudgingLoading(true);
    setJudgingError(null);
    try {
      const res = await fetch(`/api/competitions/${competitionId}/judging-analytics`);
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setJudgingError(json.error ?? "Не удалось загрузить аналитику судейства.");
        return;
      }
      setJudgingAnalytics({
        activity: json.activity,
        consensus: json.consensus,
        distribution: json.distribution,
        criteriaProfile: json.criteriaProfile,
        disputes: json.disputes,
        highlights: json.highlights,
        criteriaComparison: json.criteriaComparison,
      });
    } catch {
      setJudgingError("Не удалось загрузить аналитику судейства — проверьте соединение.");
    } finally {
      setJudgingLoading(false);
    }
  }

  if (!data) {
    return (
      <div className="rounded-app border border-admin-border bg-admin-card p-4">
        <Button type="button" size="sm" variant="adminOutline" onClick={load} disabled={loading}>
          {loading ? "Считаю статистику…" : "Показать статистику соревнования и судей"}
        </Button>
        {error && <span className="ml-2 text-sm text-red-400">{error}</span>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1 rounded-app-sm border border-admin-border bg-admin-card2 p-1">
        <TabButton label="📊 Статистика соревнования" active={tab === "competition"} onClick={() => setTab("competition")} />
        <TabButton label="⚖️ Аналитика судейства" active={tab === "judging"} onClick={openJudgingTab} />
      </div>

      {tab === "competition" && (
        <div className="flex flex-col gap-4">
          <CompetitionStatisticsPanel statistics={data.competition} />
          <TopParticipantsPanel participants={data.topFinalParticipants} />
        </div>
      )}

      {tab === "judging" && (
        <div className="flex flex-col gap-4">
          <JudgeStatisticsPanel judges={data.judges} />
          {judgingLoading && <p className="m-0 text-sm text-admin-muted">Считаю аналитику судейства…</p>}
          {judgingError && <p className="m-0 text-sm text-red-400">{judgingError}</p>}
          {judgingAnalytics && <JudgingAnalyticsPanel data={judgingAnalytics} />}
        </div>
      )}
    </div>
  );
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 rounded-[8px] px-3 py-1.5 text-sm font-semibold transition-colors",
        active ? "bg-admin-primary text-white shadow-sm" : "text-admin-muted hover:bg-admin-card hover:text-night-text"
      )}
    >
      {label}
    </button>
  );
}
