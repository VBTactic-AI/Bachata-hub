// Вертикальные столбцы со значением над каждым — для "Распределение
// оценок" (один ряд) и "Активность судей" (два ряда рядом — выставлено/
// осталось) по референсу дизайна пользователя (2026-09-11). Чистый
// SVG/CSS, без внешних библиотек графиков.
//
// Столбцы и подписи под ними — ДВЕ отдельные строки, не вложенные друг в
// друга: процентная высота (height: X%) резолвится только относительно
// предка с явно заданной высотой, а `items-end` отключает flex-stretch —
// если засунуть подпись внутрь того же flex-item, что и столбец, цепочка
// процентов схлопывается в 0 и столбцы визуально пропадают (найдено вживую
// при проверке редизайна, не гипотетически).
export type BarSeries = {
  label: string;
  colorClassName: string; // bg-*
};

export type VerticalBarGroup = {
  label: string;
  values: number[]; // по одному на каждую серию
};

export function VerticalBars({
  series,
  groups,
  height = 120,
  valueFormatter = (v: number) => `${v}`,
}: {
  series: BarSeries[];
  groups: VerticalBarGroup[];
  height?: number;
  valueFormatter?: (value: number) => string;
}) {
  const max = Math.max(1, ...groups.flatMap((g) => g.values));

  return (
    <div className="flex flex-col gap-2">
      {series.length > 1 && (
        <div className="flex flex-wrap gap-3">
          {series.map((s) => (
            <div key={s.label} className="flex items-center gap-1.5 text-xs text-admin-muted">
              <span className={`h-2 w-2 shrink-0 rounded-full ${s.colorClassName}`} />
              {s.label}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-stretch gap-3 overflow-x-auto pb-1" style={{ height }}>
        {groups.map((g) => (
          <div key={g.label} className="flex min-w-[44px] flex-1 items-end justify-center gap-1">
            {g.values.map((v, i) => (
              <div key={i} className="flex h-full w-4 flex-col items-center justify-end gap-1">
                <span className="text-[10px] font-semibold text-admin-muted">{valueFormatter(v)}</span>
                <div
                  className={`w-full rounded-t-[4px] ${series[i]?.colorClassName ?? "bg-admin-primary"}`}
                  style={{ height: `${Math.max(2, (v / max) * 100)}%` }}
                />
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        {groups.map((g) => (
          <span key={g.label} className="min-w-[44px] flex-1 truncate text-center text-[11px] text-admin-disabled" title={g.label}>
            {g.label}
          </span>
        ))}
      </div>
    </div>
  );
}
