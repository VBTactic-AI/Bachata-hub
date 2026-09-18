// Переиспользуемые "красивые" графики для admin-панели (2026-09-18, по
// прямому запросу пользователя — замена плоских полосок прогресса на
// современные SVG-визуализации). Чистые презентационные компоненты — вся
// агрегация/проценты считаются на сервере (CLAUDE.md §48 "не пиши бизнес-
// логику в React"), сюда приходят уже готовые числа. Без сторонних
// библиотек (§14 "не добавляй зависимости без необходимости") — обычный
// inline SVG, стилизованный под night-*/уже одобренную семантическую
// палитру (см. PLACE_COLORS в FinalJudgingScreen.tsx, CLAUDE.md §64.4) —
// та же самая палитра переиспользована здесь, а не выдумана заново.

export const CHART_PALETTE = ["#ff2d8a", "#37d67a", "#a78bfa", "#fb923c", "#22d3ee", "#facc15", "#ff9ac9", "#94a3b8"];

export type DonutSegment = { label: string; value: number; color?: string };

export function DonutChart({
  segments,
  centerLabel,
  centerSubLabel,
  size = 168,
  thickness = 24,
}: {
  segments: DonutSegment[];
  centerLabel?: string | number;
  centerSubLabel?: string;
  size?: number;
  thickness?: number;
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={thickness} />
          {total > 0 &&
            segments.map((s, i) => {
              if (s.value <= 0) return null;
              const length = (s.value / total) * circumference;
              const dashoffset = -offset;
              offset += length;
              const color = s.color ?? CHART_PALETTE[i % CHART_PALETTE.length];
              return (
                <circle
                  key={s.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={color}
                  strokeWidth={thickness}
                  strokeDasharray={`${length} ${circumference - length}`}
                  strokeDashoffset={dashoffset}
                  className="transition-all duration-500 ease-out"
                />
              );
            })}
        </svg>
        {centerLabel != null && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[1.7rem] font-extrabold leading-none text-night-text">{centerLabel}</span>
            {centerSubLabel && <span className="mt-1 text-[11px] text-admin-muted">{centerSubLabel}</span>}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2">
        {segments.map((s, i) => {
          const pct = total === 0 ? 0 : Math.round((s.value / total) * 100);
          const color = s.color ?? CHART_PALETTE[i % CHART_PALETTE.length];
          return (
            <div key={s.label} className="flex items-center gap-2.5 text-sm">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
              <span className="min-w-[110px] text-admin-muted">{s.label}</span>
              <span className="font-semibold tabular-nums text-night-text">{pct}%</span>
              <span className="text-xs tabular-nums text-admin-disabled">({s.value})</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export type BarItem = { label: string; value: number; color?: string; sublabel?: string };

// Горизонтальный барчарт с градиентной заливкой и скруглёнными краями —
// современная замена плоской bg-admin-primary полоски.
export function HorizontalBarChart({ items, maxValue }: { items: BarItem[]; maxValue?: number }) {
  const max = Math.max(1, maxValue ?? Math.max(...items.map((i) => i.value)));
  return (
    <div className="flex flex-col gap-3">
      {items.map((item, i) => {
        const pct = Math.round((item.value / max) * 100);
        const color = item.color ?? CHART_PALETTE[i % CHART_PALETTE.length];
        return (
          <div key={item.label} className="flex items-center gap-3">
            <span className="w-36 shrink-0 truncate text-sm text-admin-muted">{item.label}</span>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-admin-card2">
              <div
                className="h-full rounded-full transition-all duration-500 ease-out"
                style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}99, ${color})` }}
              />
            </div>
            <span className="w-20 shrink-0 text-right text-sm font-semibold tabular-nums text-night-text">
              {item.value}
              {item.sublabel && <span className="ml-1 font-normal text-admin-disabled">{item.sublabel}</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// Вертикальный барчарт (столбики) — для временных рядов (регистрации по
// дням). Скруглённые верхние углы, градиентная заливка снизу вверх.
export function VerticalBarChart({
  items,
  height = 120,
}: {
  items: { label: string; value: number }[];
  height?: number;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="flex items-end gap-2" style={{ height }}>
      {items.map((item) => {
        const pct = Math.max(4, Math.round((item.value / max) * 100));
        return (
          <div key={item.label} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
            <span className="text-xs font-semibold tabular-nums text-night-text">{item.value}</span>
            <div
              className="w-full rounded-t-md transition-all duration-500 ease-out"
              style={{ height: `${pct}%`, background: "linear-gradient(180deg, #ff2d8a, #a78bfa)" }}
            />
            <span className="w-full truncate text-center text-[10px] text-admin-disabled">{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// Кольцо с процентом в центре — для одиночных метрик (доля неявки и т.п.).
export function RadialProgress({
  percent,
  size = 108,
  thickness = 12,
  color = "#ff2d8a",
  label,
}: {
  percent: number;
  size?: number;
  thickness?: number;
  color?: string;
  label?: string;
}) {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, percent));
  const length = (clamped / 100) * circumference;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={thickness} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={`${length} ${circumference - length}`}
          className="transition-all duration-500 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-extrabold text-night-text">{Math.round(clamped)}%</span>
        {label && <span className="mt-0.5 text-[10px] text-admin-muted">{label}</span>}
      </div>
    </div>
  );
}
