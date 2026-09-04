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
    <div className="rounded-app-sm border border-line p-3 mt-2">
      <p className="m-0 font-semibold">Статистика судей</p>
      <div className="overflow-x-auto">
        <table className="w-full mt-1 text-sm">
          <thead>
            <tr>
              <th className="text-left">Судья</th>
              <th className="text-right px-1">Оценок</th>
              <th className="text-right px-1">Средний балл</th>
              <th className="text-right px-1">Разброс</th>
              <th className="text-right px-1">Согласие с панелью</th>
              <th className="text-right px-1">Доля выбросов</th>
            </tr>
          </thead>
          <tbody>
            {judges.map((j) => (
              <tr key={j.judgeUserId}>
                <td>{j.judgeEmail}</td>
                <td className="text-right px-1">{j.scoresCount}</td>
                <td className="text-right px-1">{pct(j.averageScore)}</td>
                <td className="text-right px-1">{j.scoreStdDev !== null ? j.scoreStdDev.toFixed(2) : "—"}</td>
                <td className="text-right px-1">{j.panelAgreement !== null ? j.panelAgreement.toFixed(2) : "—"}</td>
                <td className="text-right px-1">{pct(j.outlierRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
