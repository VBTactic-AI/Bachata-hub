export type FinalResultRow = {
  registrationId: string;
  role: "LEADER" | "FOLLOWER";
  displayName: string;
  bibNumber: string | null;
  totalScore: number;
  criteriaTotals: Record<string, number>;
  place: number | null;
  tieGroupKey: string | null;
};

// Итоговая таблица финала для администратора (промт пользователя, п.42) —
// критерий-в-колонку, ИТОГО отдельно, места отдельно по каждой роли
// (подтверждено пользователем, 2026-09-04). Место "⚠ перетанцовка" — группа
// с полной ничьёй, ждёт коллегиального решения (FinalTieBreakDecisionForm).
export function FinalResultsTable({
  criteria,
  results,
}: {
  criteria: { id: string; name: string; priority: number }[];
  results: FinalResultRow[];
}) {
  const sortedCriteria = [...criteria].sort((a, b) => a.priority - b.priority);

  return (
    <div className="grid gap-3 mt-2 md:grid-cols-2">
      {(["LEADER", "FOLLOWER"] as const).map((role) => {
        const rows = results
          .filter((r) => r.role === role)
          .sort((a, b) => (a.place ?? 999) - (b.place ?? 999) || b.totalScore - a.totalScore);
        if (rows.length === 0) return null;
        return (
          <div key={role}>
            <p className="hint-text m-0">{role === "LEADER" ? "Ведущие" : "Ведомые"}</p>
            <div className="overflow-x-auto">
              <table className="w-full mt-1 text-sm">
                <thead>
                  <tr>
                    <th className="text-left">Место</th>
                    <th className="text-left">Участник</th>
                    {sortedCriteria.map((c) => (
                      <th key={c.id} className="text-right px-1">
                        {c.name}
                      </th>
                    ))}
                    <th className="text-right px-1">Итого</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.registrationId} className={r.tieGroupKey ? "error-text" : ""}>
                      <td>{r.place ?? "⚠ перетанцовка"}</td>
                      <td>
                        №{r.bibNumber ?? "—"} {r.displayName}
                      </td>
                      {sortedCriteria.map((c) => (
                        <td key={c.id} className="text-right px-1">
                          {r.criteriaTotals[c.id] ?? 0}
                        </td>
                      ))}
                      <td className="text-right px-1 font-semibold">{r.totalScore}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
