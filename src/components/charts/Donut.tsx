// Общий SVG-донат для статистических экранов (CLAUDE.md §37) — чистый
// презентационный компонент, никаких запросов/бизнес-логики. Цвет сегмента
// задаётся классом текста (например "text-admin-primary"), сам SVG красится
// через currentColor — тот же приём, что уже используют admin/icons.tsx.
export type DonutSegment = {
  label: string;
  value: number;
  colorClassName: string;
};

export function Donut({
  segments,
  size = 96,
  strokeWidth = 12,
  centerValue,
  centerLabel,
  trackClassName = "text-admin-border",
}: {
  segments: DonutSegment[];
  size?: number;
  strokeWidth?: number;
  centerValue?: string | number;
  centerLabel?: string;
  trackClassName?: string;
}) {
  const total = segments.reduce((sum, s) => sum + Math.max(0, s.value), 0);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  let offsetSoFar = 0;

  return (
    <div className="flex items-center gap-3">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0 -rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={strokeWidth} className={trackClassName} />
        {total > 0 &&
          segments
            .filter((s) => s.value > 0)
            .map((s) => {
              const fraction = s.value / total;
              const dash = fraction * circumference;
              const dashArray = `${dash} ${circumference - dash}`;
              const dashOffset = -offsetSoFar;
              offsetSoFar += dash;
              return (
                <circle
                  key={s.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={strokeWidth}
                  strokeDasharray={dashArray}
                  strokeDashoffset={dashOffset}
                  strokeLinecap={segments.filter((x) => x.value > 0).length > 1 ? "butt" : "round"}
                  className={s.colorClassName}
                />
              );
            })}
      </svg>
      {(centerValue !== undefined || centerLabel) && (
        <div className="flex flex-col">
          {centerValue !== undefined && <span className="text-xl font-extrabold leading-none">{centerValue}</span>}
          {centerLabel && <span className="mt-1 text-xs opacity-70">{centerLabel}</span>}
        </div>
      )}
    </div>
  );
}

export function DonutLegend({ segments }: { segments: DonutSegment[] }) {
  return (
    <div className="flex flex-col gap-1">
      {segments.map((s) => (
        <div key={s.label} className="flex items-center gap-1.5 text-xs">
          {/* currentColor, а не bg-*, полученный подменой префикса строки:
              Tailwind JIT сканирует исходники статически и не сгенерировал бы
              класс, который нигде не встречается буквальной строкой. */}
          <span className={`h-2 w-2 shrink-0 rounded-full ${s.colorClassName}`} style={{ backgroundColor: "currentColor" }} />
          <span className="opacity-70">{s.label}</span>
          <span className="font-semibold">{s.value}</span>
        </div>
      ))}
    </div>
  );
}
