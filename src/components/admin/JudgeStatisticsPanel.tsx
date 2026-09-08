import type { JudgeStatistics } from "@/server/statistics/judge-statistics";

function pct(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

// Судейская статистика (Этап 11) — согласие с панелью и доля выбросов
// считаются по общепринятым в судейских системах методикам (ранговая
// корреляция, z-score относительно панели, docs/00_DECISIONS.md A24) —
// это аналитика для организатора, не влияет на результаты соревнования.
export function JudgeStatisticsPanel({ judges }: { judges: JudgeStatistics[] }) {
  if (judges.length === 0) return null;
  return (
    <div className="mt-2 rounded-app border border-admin-border bg-admin-card p-3">
      <p className="m-0 mb-2 font-semibold text-night-text">Статистика судей</p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs font-semibold uppercase tracking-wide text-admin-disabled">
            <tr>
              <th className="px-1 py-1.5 font-semibold">Судья</th>
              <th className="px-1 py-1.5 text-right font-semibold">Оценок</th>
              <th className="px-1 py-1.5 text-right font-semibold">Средний балл</th>
              <th className="px-1 py-1.5 text-right font-semibold">Разброс</th>
              <th className="px-1 py-1.5 text-right font-semibold">Согласие с панелью</th>
              <th className="px-1 py-1.5 text-right font-semibold">Доля выбросов</th>
            </tr>
          </thead>
          <tbody>
            {judges.map((j) => (
              <tr key={j.judgeUserId} className="border-t border-admin-border">
                <td className="px-1 py-1.5 text-night-text">{j.judgeEmail}</td>
                <td className="px-1 py-1.5 text-right text-admin-muted">{j.scoresCount}</td>
                <td className="px-1 py-1.5 text-right text-admin-muted">{pct(j.averageScore)}</td>
                <td className="px-1 py-1.5 text-right text-admin-muted">{j.scoreStdDev !== null ? j.scoreStdDev.toFixed(2) : "—"}</td>
                <td className="px-1 py-1.5 text-right text-admin-muted">{j.panelAgreement !== null ? j.panelAgreement.toFixed(2) : "—"}</td>
                <td className="px-1 py-1.5 text-right text-admin-muted">{pct(j.outlierRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
