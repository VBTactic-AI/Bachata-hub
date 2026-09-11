import type { CategoryCriteriaComparison } from "@/server/statistics/judging-analytics";

// Тепловая таблица "участник × критерий" — по референсу дизайна
// пользователя (2026-09-11). Цвет ячейки — насыщенность фирменного акцента
// пропорционально доле от максимума критерия (выше балл — гуще заливка),
// не отдельная многоцветная шкала: так проще читать на любом количестве
// критериев, не изобретая градиент "красный-жёлтый-зелёный" произвольно.
function cellStyle(value: number | null, maxScore: number): React.CSSProperties {
  if (value === null) return {};
  const fraction = maxScore > 0 ? Math.min(1, Math.max(0, value / maxScore)) : 0;
  return { backgroundColor: `rgba(59, 130, 246, ${0.12 + fraction * 0.55})` };
}

export function HeatmapTable({ data }: { data: CategoryCriteriaComparison }) {
  return (
    <div className="overflow-x-auto rounded-app border border-admin-border">
      <table className="w-full text-left text-sm">
        <thead className="bg-admin-card2 text-xs font-semibold uppercase tracking-wide text-admin-disabled">
          <tr>
            <th className="px-3 py-2 font-semibold">Участник</th>
            {data.criteriaNames.map((name) => (
              <th key={name} className="px-3 py-2 text-center font-semibold">
                {name}
              </th>
            ))}
            <th className="px-3 py-2 text-right font-semibold">Сумма</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r) => (
            <tr key={r.registrationId} className="border-t border-admin-border bg-admin-card">
              <td className="px-3 py-2 text-night-text">
                <span className="font-semibold">№{r.bibNumber ?? "—"}</span> {r.name}
              </td>
              {r.values.map((v, i) => (
                <td key={i} className="px-3 py-2 text-center font-semibold text-night-text" style={cellStyle(v, data.maxScore)}>
                  {v ?? "—"}
                </td>
              ))}
              <td className="px-3 py-2 text-right font-bold text-night-text">{r.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
