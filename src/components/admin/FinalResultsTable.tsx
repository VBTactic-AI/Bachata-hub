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
// Вместо голого "⚠ перетанцовка" показываем ЗА КАКИЕ МЕСТА именно идёт спор
// (2026-09-07, по запросу пользователя) — диапазон вычисляется из позиции
// строк тай-группы в уже отсортированном списке (rows), а не хранится
// отдельно: FinalResult не несёт поля "startPlace", но раз строки одной
// tieGroupKey всегда идут подряд после сортировки, их позиции в массиве и
// есть искомые места.
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
            <p className="hint-text m-0">{role === "LEADER" ? "Партнёры" : "Партнёрши"}</p>
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
                  {rows.map((r) => {
                    let placeLabel: string = String(r.place ?? "");
                    if (r.place == null && r.tieGroupKey) {
                      const groupPositions = rows
                        .map((x, idx) => (x.tieGroupKey === r.tieGroupKey ? idx + 1 : null))
                        .filter((x): x is number => x !== null);
                      const first = groupPositions[0];
                      const last = groupPositions[groupPositions.length - 1];
                      placeLabel = first === last ? `⚠ перетанцовка за место ${first}` : `⚠ перетанцовка за места ${first}–${last}`;
                    }
                    return (
                      <tr key={r.registrationId} className={r.tieGroupKey ? "error-text" : ""}>
                        <td>{placeLabel}</td>
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
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
