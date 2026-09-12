"use client";

import { useState } from "react";

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

// Цвета ролей — те же литералы, что и в CompetitionMonitor.tsx/
// ScoreMonitorTable.tsx/DivisionResultsPanel.tsx (ROLE_TEXT_CLASS,
// Tailwind JIT ищет полные имена классов в исходнике, интерполяция не
// работает — тот же комментарий, что и в тех файлах).
const ROLE_TEXT_CLASS: Record<"LEADER" | "FOLLOWER", string> = {
  LEADER: "text-[#60a5fa]",
  FOLLOWER: "text-[#f472b6]",
};
const ROLE_BORDER_CLASS: Record<"LEADER" | "FOLLOWER", string> = {
  LEADER: "border-[#60a5fa]",
  FOLLOWER: "border-[#f472b6]",
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
//
// На admin-* палитре (redesign 2026-09-09) — раньше жила в светлой рамке
// "Панели этапа" (bg-surface text-ink), теперь часть отдельного тёмного
// экрана "Результаты" в Мониторе, рядом с DivisionResultsPanel.
//
// Партнёры/Партнёрши — вкладки, а не две таблицы бок о бок (redesign
// 2026-09-09, по скриншоту пользователя): при 4-5 критериях таблица уже не
// влезала в половину экрана даже после xl-брейкпоинта — колонки "Итого" и
// последний критерий обрезались. Вкладка отдаёт таблице всю ширину, лишний
// горизонтальный скролл внутри карточки остаётся только страховкой на
// действительно узких экранах.
export function FinalResultsTable({
  criteria,
  results,
  format,
  judges,
}: {
  criteria: { id: string; name: string; priority: number }[];
  results: FinalResultRow[];
  // RELATIVE_PLACEMENT (скейтинг) — единственный критерий "Место" не несёт
  // суммы баллов: каждый судья ставит МЕСТО напрямую, итог — не сумма, а
  // majorityPlace (CLAUDE.md §18, final-ranking.ts). criteriaTotals для этого
  // формата хранит место каждого судьи ключом judgeAssignmentId, а НЕ
  // criterionId (final-advancement.ts) — колонка "по критерию" всегда была
  // бы пустышкой (id критерия там просто не встречается), поэтому для этого
  // формата нужны колонки по судьям, а не по критериям (жалоба пользователя,
  // 2026-09-10: "не показывается оценка по категории Место, а сразу итого").
  format?: string;
  judges?: { id: string; displayName: string; role: "LEADER" | "FOLLOWER" }[];
}) {
  const isRelativePlacement = format === "RELATIVE_PLACEMENT";
  const sortedCriteria = [...criteria].sort((a, b) => a.priority - b.priority);
  const roles = (["LEADER", "FOLLOWER"] as const).filter((role) => results.some((r) => r.role === role));
  const [active, setActive] = useState<"LEADER" | "FOLLOWER">(roles[0] ?? "LEADER");
  const role = roles.includes(active) ? active : (roles[0] ?? "LEADER");
  const roleJudges = (judges ?? []).filter((j) => j.role === role);

  const rows = results
    .filter((r) => r.role === role)
    .sort((a, b) => (a.place ?? 999) - (b.place ?? 999) || b.totalScore - a.totalScore);

  return (
    <div className="flex flex-col gap-3">
      {roles.length > 1 && (
        <div className="flex gap-1.5 rounded-app border border-admin-border bg-admin-bg/40 p-1.5" role="tablist" aria-label="Роль">
          {roles.map((r) => {
            const isActive = r === role;
            return (
              <button
                key={r}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActive(r)}
                className={`flex-1 whitespace-nowrap rounded-app-sm border px-3.5 py-2 text-sm font-bold uppercase tracking-wide transition-colors ${
                  isActive
                    ? `${ROLE_BORDER_CLASS[r]} bg-admin-card2 ${ROLE_TEXT_CLASS[r]}`
                    : "border-transparent text-admin-muted hover:bg-admin-card2 hover:text-night-text"
                }`}
              >
                {r === "LEADER" ? "Партнёры" : "Партнёрши"}
              </button>
            );
          })}
        </div>
      )}

      <div className="overflow-hidden rounded-app-sm border border-admin-border bg-admin-card2">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-admin-muted">
                <th className="px-3 py-1.5 text-left font-semibold">Место</th>
                <th className="whitespace-nowrap px-3 text-left font-semibold">Участник</th>
                {isRelativePlacement
                  ? roleJudges.map((j) => (
                      <th
                        key={j.id}
                        className="whitespace-nowrap border-l border-admin-border/60 px-3 text-right font-semibold"
                        title={j.displayName}
                      >
                        {j.displayName}
                      </th>
                    ))
                  : sortedCriteria.map((c) => (
                      <th key={c.id} className="whitespace-nowrap px-3 text-right font-semibold">
                        {c.name}
                      </th>
                    ))}
                <th className="px-3 text-right font-semibold">{isRelativePlacement ? "Итог (большинство)" : "Итого"}</th>
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
                  <tr key={r.registrationId} className="border-t border-admin-border/60">
                    <td className={`px-3 py-1.5 tabular-nums ${r.tieGroupKey ? "text-amber-400" : "font-bold text-night-text"}`}>
                      {placeLabel}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-night-text">
                      №{r.bibNumber ?? "—"} {r.displayName}
                    </td>
                    {isRelativePlacement
                      ? roleJudges.map((j) => (
                          <td key={j.id} className="border-l border-admin-border/60 px-3 text-right tabular-nums text-admin-muted">
                            {r.criteriaTotals[j.id] ?? "—"}
                          </td>
                        ))
                      : sortedCriteria.map((c) => (
                          <td key={c.id} className="px-3 text-right tabular-nums text-admin-muted">
                            {r.criteriaTotals[c.id] ?? 0}
                          </td>
                        ))}
                    <td className="px-3 text-right font-bold tabular-nums text-night-text">{r.totalScore}</td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={(isRelativePlacement ? roleJudges.length : sortedCriteria.length) + 3} className="px-3 py-3 text-center text-admin-muted">
                    Нет данных.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
