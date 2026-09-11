import type { CategoryCriteriaProfile, DisputedScore, JudgeActivity, JudgingConsensus, ScoreDistributionBucket } from "@/server/statistics/judging-analytics";
import { BarRow } from "@/components/charts/BarRow";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { Card } from "@/components/ui/card";
import { agreementBand, agreementPercentLabel, spreadBand } from "@/lib/statistics/status-labels";

export type JudgingAnalyticsData = {
  activity: JudgeActivity[];
  consensus: JudgingConsensus;
  distribution: ScoreDistributionBucket[];
  criteriaProfile: CategoryCriteriaProfile[];
  disputes: { mostControversial: DisputedScore[]; mostConsistent: DisputedScore[] };
};

// "Аналитика судейства" (2026-09-11, по прямому запросу пользователя) —
// вкладка для главного судьи: кто из судей закончил/ещё оценивает, насколько
// судьи в целом согласны друг с другом, как вообще распределены оценки,
// профиль критериев по категориям и конкретные участники, на которых судьи
// разошлись сильнее/меньше всего. Данные считаются в
// src/server/statistics/judging-analytics.ts, здесь только презентация.
export function JudgingAnalyticsPanel({ data }: { data: JudgingAnalyticsData }) {
  const agrBand = agreementBand(data.consensus.agreement);
  const spBand = spreadBand(data.consensus.spread);
  const maxBucket = Math.max(1, ...data.distribution.map((b) => b.count));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card className="border-admin-border bg-admin-card">
          <p className="m-0 text-sm text-admin-muted">Согласованность судей</p>
          <p className="m-0 mt-1 text-2xl font-extrabold text-night-text">{agreementPercentLabel(data.consensus.agreement)}</p>
          {agrBand && <StatusBadge label={agrBand.label} variant={agrBand.variant} className="mt-2" />}
        </Card>
        <Card className="border-admin-border bg-admin-card">
          <p className="m-0 text-sm text-admin-muted">Средний разброс оценок</p>
          <p className="m-0 mt-1 text-2xl font-extrabold text-night-text">{data.consensus.spread !== null ? data.consensus.spread.toFixed(2) : "—"}</p>
          {spBand && <StatusBadge label={spBand.label} variant={spBand.variant} className="mt-2" />}
        </Card>
      </div>

      {data.activity.length > 0 && (
        <div>
          <p className="m-0 mb-2 font-semibold text-night-text">Активность судей</p>
          <div className="flex flex-col gap-1.5">
            {data.activity.map((a) => (
              <div key={a.judgeUserId} className="flex items-center justify-between gap-2 rounded-app-sm border border-admin-border bg-admin-card px-3 py-2 text-sm">
                <span className="truncate font-semibold text-night-text">{a.judgeName}</span>
                {a.roundsTouched === 0 ? (
                  <StatusBadge label="Ещё не начал" variant="neutral" />
                ) : (
                  <StatusBadge
                    label={a.finished ? "Закончил" : `Ещё оценивает (${a.roundsConfirmed} из ${a.roundsTouched})`}
                    variant={a.finished ? "success" : "warning"}
                  />
                )}
              </div>
            ))}
          </div>
          <p className="m-0 mt-1.5 text-xs text-admin-disabled">Учитываются только обычные раунды — у финала своя, отдельная модель подтверждения.</p>
        </div>
      )}

      {data.distribution.some((b) => b.count > 0) && (
        <div>
          <p className="m-0 mb-2 font-semibold text-night-text">Распределение оценок</p>
          <div className="flex flex-col gap-2">
            {data.distribution.map((b) => (
              <BarRow key={b.rangeLabel} label={b.rangeLabel} fraction={b.count / maxBucket} displayValue={`${b.count}`} colorClassName="bg-admin-primary" />
            ))}
          </div>
          <p className="m-0 mt-1.5 text-xs text-admin-disabled">
            Все оценки приведены к условной шкале 1–10, чтобы раунды с разными шкалами (0/1, 0/2, критерии) можно было сравнить на одном графике.
          </p>
        </div>
      )}

      {data.criteriaProfile.length > 0 && (
        <div>
          <p className="m-0 mb-2 font-semibold text-night-text">Профиль критериев по категориям</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {data.criteriaProfile.map((cat) => (
              <div key={cat.categoryName} className="rounded-app border border-admin-border bg-admin-card p-3">
                <p className="m-0 mb-2 text-sm font-semibold text-night-text">{cat.categoryName}</p>
                <div className="flex flex-col gap-2">
                  {cat.criteria.map((c) => (
                    <BarRow key={c.name} label={c.name} fraction={c.maxScore > 0 ? c.average / c.maxScore : 0} displayValue={c.average.toFixed(1)} colorClassName="bg-admin-violet" />
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="m-0 mt-1.5 text-xs text-admin-disabled">Только категории с настроенной критериальной системой финала (не скейтинг, не обычная аддитивная схема).</p>
        </div>
      )}

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
