// Прогресс-бар "занято X из Y" для страницы "База данных" — переиспользуемый
// для любых лимитов тарифа (байты БД/Storage, количество событий Analytics
// и т.п.), поэтому value/limit — просто числа, не обязательно байты.
export function UsageBar({ label, value, limit, formatted }: { label: string; value: number; limit: number; formatted: string }) {
  const percent = Math.min(100, Math.round((value / limit) * 100));
  const tone = percent >= 90 ? "bg-red-400" : percent >= 70 ? "bg-night-warning" : "bg-admin-primary";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="m-0 text-sm font-semibold text-night-text">{label}</p>
        <p className="m-0 text-sm text-admin-muted">
          {formatted} <span className="text-admin-disabled">({percent}%)</span>
        </p>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-admin-card2">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
