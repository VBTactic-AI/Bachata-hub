import type { JudgeStatistics } from "@/server/statistics/judge-statistics";
import { BarRow, DivergingBarRow } from "@/components/charts/BarRow";
import { MetricLegend, type LegendEntry } from "@/components/charts/MetricLegend";
import { StatusBadge } from "@/components/admin/StatusBadge";
import {
  agreementBand,
  agreementPercentLabel,
  averageScoreBand,
  AVERAGE_SCORE_BANDS,
  AGREEMENT_BANDS,
  outlierBand,
  OUTLIER_BANDS,
  spreadBand,
  SPREAD_BANDS,
} from "@/lib/statistics/status-labels";

function pct(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

const LEGEND_ENTRIES: LegendEntry[] = [
  {
    title: "Средний балл",
    description: "Сколько в среднем ставит этот судья, в процентах от максимума шкалы. Не \"хорошо\" и не \"плохо\" — просто строгий судья или мягкий.",
    bands: AVERAGE_SCORE_BANDS,
    formatBoundary: (v) => (v === Infinity ? "100%" : `${Math.round(v * 100)}%`),
  },
  {
    title: "Согласие с панелью",
    description: "Ставит ли судья тех же танцоров туда же, куда и остальные судьи (кого хвалят все — хвалит и он). Ближе к +100% — судит \"в команде\" с остальными, ближе к −100% — часто расходится с общим мнением.",
    bands: AGREEMENT_BANDS,
    formatBoundary: (v) => (v === Infinity ? "+100%" : v === -Infinity ? "−100%" : `${v > 0 ? "+" : ""}${Math.round(v * 100)}%`),
  },
  {
    title: "Разброс оценок",
    description: "Насколько сильно скачут оценки одного судьи — то очень высокие, то очень низкие — или он ставит стабильно похожие баллы.",
    bands: SPREAD_BANDS,
    formatBoundary: (v) => (v === Infinity ? "" : v.toFixed(2)),
  },
  {
    title: "Доля выбросов",
    description: "Как часто оценка этого судьи заметно отличалась от оценок остальных судей тому же участнику. Высокая доля — не обязательно ошибка, но повод обратить внимание.",
    bands: OUTLIER_BANDS,
    formatBoundary: (v) => (v === Infinity ? "100%" : `${Math.round(v * 100)}%`),
  },
];

// Судейская статистика (Этап 11) — согласие с панелью и доля выбросов
// считаются по общепринятым в судейских системах методикам (ранговая
// корреляция, z-score относительно панели, docs/00_DECISIONS.md A24) —
// это аналитика для организатора, не влияет на результаты соревнования.
// Карточки с барами вместо плоской таблицы (те же самые числа) — так
// расхождение между судьями видно на глаз, а не только по цифрам в столбик.
// Статус-бейджи рядом с цифрами (2026-09-11, по прямому запросу пользователя) —
// сама цифра никуда не пропадает, просто рядом ещё и словесная расшифровка;
// точные диапазоны — src/lib/statistics/status-labels.ts, легенда ниже
// построена из тех же данных, числа не могут разойтись с логикой.
export function JudgeStatisticsPanel({ judges }: { judges: JudgeStatistics[] }) {
  if (judges.length === 0) return null;
  return (
    <div className="mt-2 flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 font-semibold text-night-text">Статистика судей</p>
        <MetricLegend entries={LEGEND_ENTRIES} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {judges.map((j) => {
          const avgBand = averageScoreBand(j.averageScore);
          const agrBand = agreementBand(j.panelAgreement);
          const spBand = spreadBand(j.scoreStdDev);
          const outBand = outlierBand(j.outlierRate);
          return (
            <div key={j.judgeUserId} className="rounded-app border border-admin-border bg-admin-card p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold text-night-text" title={j.judgeName}>
                  {j.judgeName}
                </span>
                <span className="shrink-0 rounded-full bg-admin-border px-2 py-0.5 text-xs font-semibold text-admin-muted">
                  {j.scoresCount} оц.
                </span>
              </div>
              <div className="flex flex-col gap-2.5">
                <div className="flex flex-col gap-1">
                  <BarRow label="Средний балл" fraction={j.averageScore} displayValue={pct(j.averageScore)} colorClassName="bg-admin-primary" />
                  {avgBand && <StatusBadge label={avgBand.label} variant={avgBand.variant} className="self-start" />}
                </div>
                <div className="flex flex-col gap-1">
                  <DivergingBarRow label="Согласие с панелью" value={j.panelAgreement} displayValue={agreementPercentLabel(j.panelAgreement)} />
                  {agrBand && <StatusBadge label={agrBand.label} variant={agrBand.variant} className="self-start" />}
                </div>
                <div className="flex flex-col gap-1">
                  <BarRow label="Доля выбросов" fraction={j.outlierRate} displayValue={pct(j.outlierRate)} colorClassName="bg-night-warning" />
                  {outBand && <StatusBadge label={outBand.label} variant={outBand.variant} className="self-start" />}
                </div>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-admin-disabled">Разброс оценок: {j.scoreStdDev !== null ? j.scoreStdDev.toFixed(2) : "—"}</span>
                  {spBand && <StatusBadge label={spBand.label} variant={spBand.variant} />}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
