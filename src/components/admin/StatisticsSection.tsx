"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { CompetitionStatistics } from "@/server/statistics/competition-statistics";
import type { JudgeStatistics } from "@/server/statistics/judge-statistics";
import { CompetitionStatisticsPanel } from "./CompetitionStatisticsPanel";
import { JudgeStatisticsPanel } from "./JudgeStatisticsPanel";

// Статистика загружается по кнопке, а не вместе с карточкой соревнования.
// Причина — производительность, замеренная на живых данных (2026-09-08):
// два свода статистики стоили 12 SQL-запросов из 29 на странице и
// пересчитывались после КАЖДОГО действия организатора (router.refresh()).
// Во время живого соревнования это самая горячая страница, а аналитика на
// ней нужна изредка.
export function StatisticsSection({ competitionId }: { competitionId: string }) {
  const [data, setData] = useState<{ competition: CompetitionStatistics; judges: JudgeStatistics[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setData({ competition: json.competition, judges: json.judges });
    } catch {
      setError("Не удалось загрузить статистику — проверьте соединение.");
    } finally {
      setLoading(false);
    }
  }

  if (data) {
    return (
      <div>
        <CompetitionStatisticsPanel statistics={data.competition} />
        <JudgeStatisticsPanel judges={data.judges} />
      </div>
    );
  }

  return (
    <div className="rounded-app border border-night-border bg-night-card p-4">
      <Button type="button" size="sm" variant="adminOutline" onClick={load} disabled={loading}>
        {loading ? "Считаю статистику…" : "Показать статистику соревнования и судей"}
      </Button>
      {error && <span className="ml-2 text-sm text-red-400">{error}</span>}
    </div>
  );
}
