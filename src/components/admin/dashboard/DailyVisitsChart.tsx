import type { DailyVisits } from "@/lib/vercel-analytics";

const VIEW_W = 560;
const VIEW_H = 160;
const PADDING_BOTTOM = 20;
const BAR_GAP = 4;

const DAY_MONTH_FMT = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit" });

// Столбчатый график посещений по дням (Vercel Web Analytics) — обычный
// inline SVG, без графической библиотеки (в проекте её нет нигде, CLAUDE.md
// §14 — не тащить зависимость ради одного графика). Палитра — те же синие
// оттенки admin-primary/primaryHover, что и у ActivityNetworkGraph.tsx,
// просто как hex (Tailwind-классы к атрибутам fill/stroke SVG не применяются).
export function DailyVisitsChart({ data }: { data: DailyVisits[] }) {
  if (data.length === 0) {
    return <p className="m-0 text-sm text-admin-muted">За выбранный период данных нет.</p>;
  }

  const maxPageviews = Math.max(1, ...data.map((d) => d.pageviews));
  const barWidth = (VIEW_W - BAR_GAP * (data.length - 1)) / data.length;
  const chartHeight = VIEW_H - PADDING_BOTTOM;

  return (
    <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="h-auto w-full" role="img" aria-label="Посещения сайта по дням">
      {data.map((day, i) => {
        const barHeight = Math.max(2, (day.pageviews / maxPageviews) * (chartHeight - 8));
        const x = i * (barWidth + BAR_GAP);
        const y = chartHeight - barHeight;
        const showLabel = data.length <= 10 || i % Math.ceil(data.length / 10) === 0;
        return (
          <g key={day.date}>
            <title>{`${new Date(day.date).toLocaleDateString("ru-RU")}: ${day.pageviews} просмотров, ${day.visitors} посетителей`}</title>
            <rect x={x} y={y} width={barWidth} height={barHeight} rx="3" fill="#3b82f6" />
            {showLabel && (
              <text x={x + barWidth / 2} y={VIEW_H - 4} textAnchor="middle" fontSize="10" fill="#8b95b3">
                {DAY_MONTH_FMT.format(new Date(day.date))}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
