import type {
  CategoryCriteriaComparison,
  CategoryCriteriaProfile,
  DisputedScore,
  JudgeActivity,
  JudgingConsensus,
  JudgingHighlights,
  ScoreDistributionBucket,
} from "@/server/statistics/judging-analytics";
import { StatCard } from "@/components/admin/StatCard";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { Card } from "@/components/ui/card";
import { VerticalBars } from "@/components/charts/VerticalBars";
import { RadarChart } from "@/components/charts/RadarChart";
import { HeatmapTable } from "@/components/charts/HeatmapTable";
import { StarIcon, TargetIcon, ActivityIcon, JudgesIcon, BulbIcon } from "@/components/admin/icons";
import { agreementBand, agreementPercentLabel, spreadBand } from "@/lib/statistics/status-labels";

export type JudgingAnalyticsData = {
  activity: JudgeActivity[];
  consensus: JudgingConsensus;
  distribution: ScoreDistributionBucket[];
  criteriaProfile: CategoryCriteriaProfile[];
  disputes: { mostControversial: DisputedScore[]; mostConsistent: DisputedScore[] };
  highlights: JudgingHighlights;
  criteriaComparison: CategoryCriteriaComparison[];
};

function scoreLabel(raw: { rawValue: number; rawMax: number }): string {
  return `${raw.rawValue}/${raw.rawMax}`;
}

// "Аналитика судейства" (2026-09-11, редизайн под референс пользователя —
// плотная дашборд-сетка вместо разрозненных блоков) — вкладка для главного
// судьи. Все цифры считаются в src/server/statistics/judging-analytics.ts,
// здесь только презентация.
export function JudgingAnalyticsPanel({ data }: { data: JudgingAnalyticsData }) {
  const agrBand = agreementBand(data.consensus.agreement);
  const spBand = spreadBand(data.consensus.spread);
  const h = data.highlights;

  const insights = buildInsights(data);

  return (
    <div className="flex flex-col gap-4">
      {/* Ключевые показатели */}
      <div>
        <p className="m-0 mb-2 font-semibold text-night-text">Ключевые показатели</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <Card className="border-admin-border bg-admin-card">
            <p className="m-0 text-xs text-admin-muted">Согласованность судей</p>
            <p className="m-0 mt-1 text-xl font-extrabold text-night-text">{agreementPercentLabel(data.consensus.agreement)}</p>
            {agrBand && <StatusBadge label={agrBand.label} variant={agrBand.variant} className="mt-2" />}
          </Card>
          <Card className="border-admin-border bg-admin-card">
            <p className="m-0 text-xs text-admin-muted">Средний разброс</p>
            <p className="m-0 mt-1 text-xl font-extrabold text-night-text">{data.consensus.spread !== null ? data.consensus.spread.toFixed(2) : "—"}</p>
            {spBand && <StatusBadge label={spBand.label} variant={spBand.variant} className="mt-2" />}
          </Card>
          {h.topAverageJudge && (
            <StatCard
              label="Самый высокий средний балл"
              value={`${Math.round(h.topAverageJudge.averageScore * 100)}%`}
              icon={<StarIcon />}
              tone="primary"
            />
          )}
          {h.highestSingleScore && (
            <StatCard
              label={`Самая высокая оценка — №${h.highestSingleScore.bibNumber ?? "—"} ${h.highestSingleScore.name}`}
              value={scoreLabel(h.highestSingleScore)}
              icon={<TargetIcon />}
              tone="success"
            />
          )}
          {h.mostStableParticipant && (
            <StatCard
              label={`Самый стабильный участник — №${h.mostStableParticipant.bibNumber ?? "—"} ${h.mostStableParticipant.name}`}
              value={`± ${(h.mostStableParticipant.spread * 100).toFixed(0)}%`}
              icon={<ActivityIcon />}
              tone="success"
            />
          )}
          {h.mostActiveJudge && (
            <StatCard label={`Больше всех оценок — ${h.mostActiveJudge.judgeName}`} value={h.mostActiveJudge.scoresCount} icon={<JudgesIcon />} tone="primary" />
          )}
        </div>
      </div>

      {/* Аналитика и выводы */}
      {insights.length > 0 && (
        <div>
          <p className="m-0 mb-2 font-semibold text-night-text">Аналитика и выводы</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {insights.map((ins) => (
              <div key={ins.title} className="flex items-start gap-2.5 rounded-app border border-admin-border bg-admin-card p-3">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-admin-primary/15 text-admin-primaryHover">
                  <BulbIcon />
                </span>
                <div>
                  <p className="m-0 text-sm font-semibold text-night-text">{ins.title}</p>
                  <p className="m-0 mt-0.5 text-xs text-admin-muted">{ins.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Активность судей */}
      {data.activity.length > 0 && (
        <div className="rounded-app border border-admin-border bg-admin-card p-3">
          <p className="m-0 mb-3 text-sm font-semibold text-night-text">Активность судей</p>
          <VerticalBars
            series={[
              { label: "Подтверждено", colorClassName: "bg-admin-primary" },
              { label: "Осталось", colorClassName: "bg-admin-border" },
            ]}
            groups={data.activity.map((a) => ({ label: a.judgeName, values: [a.roundsConfirmed, Math.max(0, a.roundsTouched - a.roundsConfirmed)] }))}
          />
          <p className="m-0 mt-2 text-xs text-admin-disabled">Учитываются только обычные раунды — у финала своя, отдельная модель подтверждения.</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {/* Распределение оценок */}
        {data.distribution.some((b) => b.count > 0) && (
          <div className="rounded-app border border-admin-border bg-admin-card p-3">
            <p className="m-0 mb-3 text-sm font-semibold text-night-text">Распределение оценок</p>
            <VerticalBars
              series={[{ label: "Оценок", colorClassName: "bg-admin-primary" }]}
              groups={data.distribution.map((b) => ({ label: b.rangeLabel, values: [b.count] }))}
            />
            <p className="m-0 mt-2 text-xs text-admin-disabled">
              Все оценки приведены к условной шкале 1–10, чтобы раунды с разными шкалами (0/1, 0/2, критерии) можно было сравнить на одном графике.
            </p>
          </div>
        )}

        {/* Профиль критериев */}
        {data.criteriaProfile.length > 0 && (
          <div className="rounded-app border border-admin-border bg-admin-card p-3">
            <p className="m-0 mb-1 text-sm font-semibold text-night-text">Профиль критериев по категориям</p>
            <div className="flex flex-wrap justify-center gap-4">
              {data.criteriaProfile.map((cat) => (
                <div key={cat.categoryName} className="flex flex-col items-center">
                  <RadarChart
                    size={220}
                    series={[
                      {
                        label: cat.categoryName,
                        colorClassName: "text-admin-primary",
                        axes: cat.criteria.map((c) => ({ label: c.name, value: c.average, maxValue: c.maxScore })),
                      },
                    ]}
                  />
                  <p className="m-0 mt-1 text-xs font-semibold text-admin-muted">{cat.categoryName}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Сравнение участников по критериям */}
      {data.criteriaComparison.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="m-0 font-semibold text-night-text">Сравнение участников по критериям</p>
          {data.criteriaComparison.map((cat) => (
            <div key={cat.categoryName} className="flex flex-col gap-1.5">
              <p className="m-0 text-xs font-semibold uppercase tracking-wide text-admin-disabled">{cat.categoryName}</p>
              <HeatmapTable data={cat} />
            </div>
          ))}
        </div>
      )}

      {/* Споры между судьями */}
      {data.disputes.mostControversial.length > 0 && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <DisputeList title="Самые спорные оценки" items={data.disputes.mostControversial} tone="danger" />
          <DisputeList title="Самые стабильные оценки" items={data.disputes.mostConsistent} tone="success" />
        </div>
      )}
    </div>
  );
}

function DisputeList({ title, items, tone }: { title: string; items: DisputedScore[]; tone: "danger" | "success" }) {
  return (
    <div>
      <p className="m-0 mb-2 font-semibold text-night-text">{title}</p>
      <div className="flex flex-col gap-2">
        {items.map((it, i) => (
          <div key={`${it.registrationId}-${i}`} className="rounded-app-sm border border-admin-border bg-admin-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold text-night-text">
                №{it.bibNumber ?? "—"} {it.name}{" "}
                <span className="font-normal text-admin-muted">
                  ({it.role}, {it.contextLabel})
                </span>
              </span>
              <StatusBadge label={`разброс ${Math.round(it.spread * 100)}%`} variant={tone} />
            </div>
            <p className="m-0 mt-1.5 text-xs text-admin-muted">{it.perJudge.map((j) => `${j.judgeName} → ${j.rawValue}`).join(" · ")}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

type Insight = { title: string; description: string };

// Выводы собраны из уже посчитанных данных этого же ответа API — ничего не
// придумывается и не тянется отдельным запросом.
function buildInsights(data: JudgingAnalyticsData): Insight[] {
  const insights: Insight[] = [];

  if (data.consensus.agreement !== null) {
    const pct = Math.round(data.consensus.agreement * 100);
    insights.push({
      title: `Судьи в целом ${pct >= 70 ? "хорошо согласны друг с другом" : pct >= 0 ? "умеренно согласны друг с другом" : "заметно расходятся во мнениях"}`,
      description: `Общая согласованность панели — ${agreementPercentLabel(data.consensus.agreement)}.`,
    });
  }

  const hardestCategory = [...data.criteriaProfile]
    .map((cat) => ({ cat, avgFraction: cat.criteria.reduce((s, c) => s + (c.maxScore > 0 ? c.average / c.maxScore : 0), 0) / Math.max(1, cat.criteria.length) }))
    .sort((a, b) => a.avgFraction - b.avgFraction)[0];
  if (hardestCategory && data.criteriaProfile.length > 1) {
    insights.push({
      title: `Категория «${hardestCategory.cat.categoryName}» получила самые низкие оценки`,
      description: "Средний балл по критериям здесь ниже, чем в остальных категориях с критериальным финалом.",
    });
  }

  const topDispute = data.disputes.mostControversial[0];
  if (topDispute) {
    insights.push({
      title: `Самое сильное расхождение — №${topDispute.bibNumber ?? "—"} ${topDispute.name}`,
      description: `${topDispute.contextLabel}: ${topDispute.perJudge.map((j) => `${j.judgeName} → ${j.rawValue}`).join(", ")}.`,
    });
  }

  const notFinished = data.activity.filter((a) => a.roundsTouched > 0 && !a.finished);
  if (notFinished.length > 0) {
    insights.push({
      title: `${notFinished.length === 1 ? "Один судья ещё не подтвердил" : `${notFinished.length} судей ещё не подтвердили`} все свои раунды`,
      description: notFinished.map((a) => `${a.judgeName} (${a.roundsConfirmed} из ${a.roundsTouched})`).join(", "),
    });
  }

  return insights;
}
