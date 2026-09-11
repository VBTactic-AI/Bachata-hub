import type { JudgeStatistics } from "@/server/statistics/judge-statistics";
import { BarRow, DivergingBarRow } from "@/components/charts/BarRow";

function pct(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

// Судейская статистика (Этап 11) — согласие с панелью и доля выбросов
// считаются по общепринятым в судейских системах методикам (ранговая
// корреляция, z-score относительно панели, docs/00_DECISIONS.md A24) —
// это аналитика для организатора, не влияет на результаты соревнования.
// Карточки с барами вместо плоской таблицы (те же самые числа) — так
// расхождение между судьями видно на глаз, а не только по цифрам в столбик.
export function JudgeStatisticsPanel({ judges }: { judges: JudgeStatistics[] }) {
  if (judges.length === 0) return null;
  return (
    <div className="mt-2 flex flex-col gap-2">
      <p className="m-0 font-semibold text-night-text">Статистика судей</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {judges.map((j) => (
          <div key={j.judgeUserId} className="rounded-app border border-admin-border bg-admin-card p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="truncate text-sm font-semibold text-night-text" title={j.judgeEmail}>
                {j.judgeEmail}
              </span>
              <span className="shrink-0 rounded-full bg-admin-border px-2 py-0.5 text-xs font-semibold text-admin-muted">
                {j.scoresCount} оц.
              </span>
            </div>
            <div className="flex flex-col gap-2.5">
              <BarRow
                label="Средний балл"
                fraction={j.averageScore}
                displayValue={pct(j.averageScore)}
                colorClassName="bg-admin-primary"
              />
              <DivergingBarRow label="Согласие с панелью" value={j.panelAgreement} displayValue={j.panelAgreement !== null ? j.panelAgreement.toFixed(2) : "—"} />
              <BarRow
                label="Доля выбросов"
                fraction={j.outlierRate}
                displayValue={pct(j.outlierRate)}
                colorClassName="bg-night-warning"
              />
              <p className="m-0 text-xs text-admin-disabled">Разброс оценок: {j.scoreStdDev !== null ? j.scoreStdDev.toFixed(2) : "—"}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
