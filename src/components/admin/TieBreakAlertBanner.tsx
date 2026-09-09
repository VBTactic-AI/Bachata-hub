import type { PendingTieBreakRow } from "@/lib/competition-overview";

// CLAUDE.md §21: "UI должен явно показывать TIE-BREAK REQUIRED" — баннер не
// прячет и не решает ничью сам, только ведёт к раунду в Мониторе, где стоит
// TieBreakDecisionForm/FinalTieBreakDecisionForm (решение принимают судьи,
// не эта карточка).
export function TieBreakAlertBanner({ rows }: { rows: PendingTieBreakRow[] }) {
  if (rows.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {rows.map((row) => (
        <div
          key={row.roundId}
          className="flex flex-wrap items-center gap-3.5 rounded-app border border-red-400/40 bg-gradient-to-br from-red-400/[0.13] to-red-400/[0.03] p-4"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-400/15 text-red-400">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M12 3.5 21.5 20h-19L12 3.5Z" strokeLinejoin="round" />
              <path d="M12 9.5v4.5" strokeLinecap="round" />
              <circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none" />
            </svg>
          </span>
          <div className="min-w-[260px] flex-1">
            <p className="m-0 text-sm font-extrabold tracking-wide text-red-200">
              ТРЕБУЕТСЯ TIE-BREAK · {row.categoryName}, {row.stageLabel}
            </p>
            <p className="m-0 mt-0.5 text-sm text-admin-muted">
              {row.kind === "SELECT_N" ? (
                <>
                  {row.candidates.length} участник{row.candidates.length === 1 ? "" : row.candidates.length < 5 ? "а" : "ов"} на{" "}
                  <b className="font-bold text-night-text">{row.freeSlots}</b> свободных мест{row.freeSlots === 1 ? "о" : ""} — судьи
                  должны выбрать, кто проходит дальше.
                </>
              ) : row.kind === "FULL_RANK" ? (
                <>Перетанцовка за место — судьи определяют порядок среди {row.candidates.length} участников.</>
              ) : (
                <>Финал — судьи должны определить места среди {row.candidates.length} участников с одинаковым результатом.</>
              )}
            </p>
          </div>
          {/* Обычный <a>, не next/link — см. FloorSpotlight.tsx: Монитор
              читает category/round из URL только при монтировании. */}
          <a
            href={row.monitorHref}
            className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-app-sm bg-gradient-to-r from-red-400 to-red-600 px-[18px] py-2.5 text-sm font-bold text-white shadow-[0_8px_20px_-8px_rgba(248,113,113,0.5)] transition-transform hover:brightness-105"
          >
            Открыть Tie-Break →
          </a>
        </div>
      ))}
    </div>
  );
}
