// Компактная "шапка контекста" судейского экрана (2026-09-10, по запросу
// пользователя): категория/роль, этап + текущий заход, план отбора —
// иконками в одну-две строки, вместо мелкой серой подписи под заголовком.
// Чистая презентация — все значения приходят готовыми props, эта функция
// ничего не считает и не решает (CLAUDE.md §48).
function LayersIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4 3 9l9 5 9-5-9-5Z" />
      <path d="M3 14l9 5 9-5" />
    </svg>
  );
}
function FlagIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 3v18" />
      <path d="M5 4h11l-2.5 3.5L16 11H5" />
    </svg>
  );
}
function TargetIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

function Chip({ icon, children, accent }: { icon: React.ReactNode; children: React.ReactNode; accent?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-bold ${
        accent ? "border-admin-primary/40 text-admin-primary" : "border-admin-border text-night-text"
      } bg-admin-card2`}
    >
      <span className={`h-3.5 w-3.5 shrink-0 ${accent ? "text-admin-primary" : "text-admin-primary"}`}>{icon}</span>
      {children}
    </span>
  );
}

export function ContextBar({
  categoryLabel,
  stageLabel,
  quotaLabel,
}: {
  categoryLabel: string;
  stageLabel?: string;
  quotaLabel?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1.5">
        <Chip icon={<LayersIcon />}>{categoryLabel}</Chip>
      </div>
      {(stageLabel || quotaLabel) && (
        <div className="flex flex-wrap gap-1.5">
          {stageLabel && <Chip icon={<FlagIcon />}>{stageLabel}</Chip>}
          {quotaLabel && (
            <Chip icon={<TargetIcon />} accent>
              {quotaLabel}
            </Chip>
          )}
        </div>
      )}
    </div>
  );
}
