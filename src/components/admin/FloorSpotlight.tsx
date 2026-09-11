import type { FloorSpotlight as FloorSpotlightData } from "@/lib/competition-overview";
import { LiveDot } from "@/components/LiveDot";

// Цвета ролей — те же литералы, что и в CompetitionMonitor.tsx/
// ScoreMonitorTable.tsx/DivisionResultsPanel.tsx (ROLE_TEXT_CLASS и т.п.,
// Tailwind JIT ищет полные имена классов в исходнике, интерполяция не
// работает — комментарий продублирован по той же причине, что и в тех
// файлах).
const ROLE_TEXT_CLASS = { LEADER: "text-[#60a5fa]", FOLLOWER: "text-[#f472b6]" } as const;
const ROLE_DOT_CLASS = { LEADER: "bg-[#60a5fa]", FOLLOWER: "bg-[#f472b6]" } as const;
const ROLE_BIB_CLASS = {
  LEADER: "border-[#60a5fa]/40 bg-[#60a5fa]/10",
  FOLLOWER: "border-[#f472b6]/40 bg-[#f472b6]/10",
} as const;

function FloorColumn({ role, label, people }: { role: "LEADER" | "FOLLOWER"; label: string; people: { bibNumber: string | null; displayName: string }[] }) {
  return (
    <div>
      <h5 className={`m-0 mb-2.5 flex items-center gap-1.5 text-[0.72rem] font-extrabold uppercase tracking-wide ${ROLE_TEXT_CLASS[role]}`}>
        <span className={`h-2 w-2 shrink-0 rounded-full ${ROLE_DOT_CLASS[role]}`} />
        {label} · {people.length}
      </h5>
      <div className="flex flex-wrap gap-1.5">
        {people.map((p, i) => (
          <span
            key={i}
            title={p.displayName}
            className={`rounded-full border px-2.5 py-1 text-[0.82rem] font-bold tabular-nums text-night-text ${ROLE_BIB_CLASS[role]}`}
          >
            №{p.bibNumber ?? "—"}
          </span>
        ))}
      </div>
    </div>
  );
}

export function FloorSpotlight({ data }: { data: FloorSpotlightData }) {
  return (
    <div className="rounded-app border border-admin-border bg-gradient-to-br from-[#111a30] to-admin-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2 pt-0.5 text-[0.75rem] font-extrabold uppercase tracking-wide text-night-success">
          <LiveDot />
          Сейчас на паркете
        </div>
        {/* Обычный <a>, не next/link: Монитор и переключатель вкладок читают
            category/round/heat/tab из URL один раз при монтировании
            (useState-инициализатор, CompetitionMonitor.tsx/
            CompetitionWorkspaceTabs.tsx) — клиентская навигация Link в
            пределах того же роута их не перемонтирует, и выбор останется
            старым. Обычная ссылка — полноценный переход, точно перечитает URL. */}
        <a
          href={data.monitorHref}
          className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-app-sm bg-gradient-admin-cta px-[18px] py-2.5 text-sm font-extrabold text-white shadow-[0_0_0_3px_rgba(59,130,246,0.16),0_10px_24px_-10px_rgba(59,130,246,0.7)] transition-[filter] hover:brightness-110"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <rect x="3" y="4.5" width="18" height="12" rx="2" />
            <path d="M8 20.5h8M12 16.5v4" strokeLinecap="round" />
          </svg>
          Открыть в Мониторе
        </a>
      </div>

      <div className="mt-4 flex flex-wrap items-start gap-7">
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 text-[0.68rem] font-extrabold uppercase tracking-wide text-admin-muted">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: data.categoryColor }} />
            Категория
          </span>
          <span className="text-[1.75rem] font-extrabold uppercase leading-tight tabular-nums" style={{ color: data.categoryColor }}>
            {data.categoryName}
          </span>
        </div>
        <div className="hidden self-stretch border-l border-admin-border sm:block" />
        <div className="flex flex-col gap-1">
          <span className="text-[0.68rem] font-extrabold uppercase tracking-wide text-admin-muted">Этап</span>
          <span className="text-[1.75rem] font-extrabold uppercase leading-tight text-night-text">{data.stageLabel}</span>
        </div>
        <div className="hidden self-stretch border-l border-admin-border sm:block" />
        <div className="flex flex-col gap-1">
          <span className="text-[0.68rem] font-extrabold uppercase tracking-wide text-admin-muted">Заход</span>
          <span className="text-[1.75rem] font-extrabold uppercase leading-tight tabular-nums text-night-text">
            {data.heatNumber} <small className="text-[1.05rem] font-bold normal-case text-admin-muted">из {data.heatsTotal}</small>
          </span>
        </div>
      </div>

      <p className="m-0 mt-4 border-t border-admin-border pt-3.5 text-sm text-admin-muted">
        Формат оценки: <b className="font-bold text-night-text">{data.judgingFormatLabel}</b>
        {data.scoring === null && (
          <>
            {" · "}
            {data.heatStatusLabel}
          </>
        )}
      </p>

      <div className="mt-5 grid grid-cols-1 items-start gap-5 sm:grid-cols-[1fr_1fr_auto]">
        <FloorColumn role="LEADER" label="Партнёры" people={data.leaders} />
        <FloorColumn role="FOLLOWER" label="Партнёрши" people={data.followers} />
        <div className="flex flex-row gap-5 border-t border-admin-border pt-3.5 sm:flex-col sm:gap-3.5 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
          <div>
            <p className="m-0 text-[1.3rem] font-extrabold text-night-text">{data.judgesAssignedCount}</p>
            <p className="m-0 text-[0.76rem] text-admin-muted">судьи назначены</p>
          </div>
          {data.scoring && (
            <div className="min-w-[110px]">
              <p className="m-0 text-[1.3rem] font-extrabold text-night-text">
                {data.scoring.submitted} из {data.scoring.required}
              </p>
              <p className="m-0 text-[0.76rem] text-admin-muted">оценок собрано</p>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-admin-card2">
                <div
                  className="h-full rounded-full bg-admin-primary transition-all"
                  style={{ width: `${data.scoring.required === 0 ? 100 : Math.round((data.scoring.submitted / data.scoring.required) * 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
