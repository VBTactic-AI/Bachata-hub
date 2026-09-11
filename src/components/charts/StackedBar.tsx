// Сегментированная полоса "часть от целого" (например воронка явки:
// check-in / не пришли / снялись / дисквалифицированы из общего числа
// регистраций) — CLAUDE.md §37, чистая презентация уже посчитанных чисел.
export type StackedSegment = {
  label: string;
  value: number;
  colorClassName: string;
};

export function StackedBar({
  segments,
  total,
  trackClassName = "bg-admin-border",
}: {
  segments: StackedSegment[];
  total: number;
  trackClassName?: string;
}) {
  const shown = segments.filter((s) => s.value > 0);
  return (
    <div className="flex flex-col gap-2">
      <div className={`flex h-3 w-full overflow-hidden rounded-full ${trackClassName}`}>
        {total > 0 &&
          shown.map((s) => (
            <div
              key={s.label}
              className={s.colorClassName}
              style={{ width: `${(s.value / total) * 100}%` }}
              title={`${s.label}: ${s.value}`}
            />
          ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5 text-xs">
            <span className={`h-2 w-2 shrink-0 rounded-full ${s.colorClassName}`} />
            <span className="opacity-70">{s.label}</span>
            <span className="font-semibold">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
