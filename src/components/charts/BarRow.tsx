// Горизонтальные бары для статистических экранов (CLAUDE.md §37) — чистая
// презентация уже посчитанных на сервере чисел, без какой-либо логики.

export function BarRow({
  label,
  displayValue,
  fraction,
  colorClassName = "bg-admin-primary",
  trackClassName = "bg-admin-border",
}: {
  label: string;
  displayValue: string;
  /** 0..1, доля заполнения полосы */
  fraction: number | null;
  colorClassName?: string;
  trackClassName?: string;
}) {
  const pct = fraction === null ? 0 : Math.min(100, Math.max(0, fraction * 100));
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="opacity-70">{label}</span>
        <span className="font-semibold">{fraction === null ? "—" : displayValue}</span>
      </div>
      <div className={`h-1.5 w-full overflow-hidden rounded-full ${trackClassName}`}>
        <div className={`h-full rounded-full ${colorClassName}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// Дивергирующий бар для метрик в диапазоне -1..1 (например "согласие с
// панелью" — ранговая корреляция Спирмена, docs/00_DECISIONS.md A24):
// нулевая точка — центр полосы, положительное значение растёт вправо
// (согласие), отрицательное — влево (расхождение с панелью).
export function DivergingBarRow({
  label,
  displayValue,
  value,
  positiveClassName = "bg-night-success",
  negativeClassName = "bg-red-400",
  trackClassName = "bg-admin-border",
}: {
  label: string;
  displayValue: string;
  /** -1..1, либо null если недостаточно данных */
  value: number | null;
  positiveClassName?: string;
  negativeClassName?: string;
  trackClassName?: string;
}) {
  const clamped = value === null ? 0 : Math.min(1, Math.max(-1, value));
  const isPositive = clamped >= 0;
  const halfWidthPct = Math.abs(clamped) * 50;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="opacity-70">{label}</span>
        <span className="font-semibold">{value === null ? "—" : displayValue}</span>
      </div>
      <div className={`relative h-1.5 w-full overflow-hidden rounded-full ${trackClassName}`}>
        <span className="absolute left-1/2 top-0 h-full w-px bg-current opacity-30" />
        {value !== null && (
          <div
            className={`absolute top-0 h-full rounded-full ${isPositive ? positiveClassName : negativeClassName}`}
            style={
              isPositive
                ? { left: "50%", width: `${halfWidthPct}%` }
                : { right: "50%", width: `${halfWidthPct}%` }
            }
          />
        )}
      </div>
    </div>
  );
}
