// Радар (паутина) для "Профиль категории по критериям" — по референсу
// дизайна пользователя (2026-09-11). Чистый SVG, оси — критерии, значение
// каждой оси нормализовано к своему maxScore (у критериев бывают разные
// диапазоны).
export type RadarAxis = { label: string; value: number; maxValue: number };
export type RadarSeries = { label: string; colorClassName: string; axes: RadarAxis[] };

function pointOnAxis(index: number, count: number, fraction: number, radius: number, center: number) {
  const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
  return [center + Math.cos(angle) * radius * fraction, center + Math.sin(angle) * radius * fraction] as const;
}

export function RadarChart({ series, size = 220, rings = 4 }: { series: RadarSeries[]; size?: number; rings?: number }) {
  if (series.length === 0 || series[0].axes.length < 3) return null;
  const count = series[0].axes.length;
  const center = size / 2;
  // Радиус самого полигона против размера SVG — разница отдаёт полю вокруг
  // подписи достаточно места, чтобы длинные слова ("Взаимодействие") не
  // обрезались о край SVG (найдено вживую при проверке — на боковой оси у
  // самого края текст буквально резало пополам). Подобрано так, чтобы
  // хватало margin даже с anchor="middle" (запас на половину ширины слова
  // в обе стороны от точки), а не "наружу от центра", которое при таком
  // маленьком радиусе всё равно упиралось бы в край с той же проблемой.
  const radius = size / 2 - 70;

  const gridRings = Array.from({ length: rings }, (_, i) => (i + 1) / rings);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="mx-auto">
      {gridRings.map((f) => {
        const points = Array.from({ length: count }, (_, i) => pointOnAxis(i, count, f, radius, center).join(",")).join(" ");
        return <polygon key={f} points={points} fill="none" stroke="currentColor" strokeWidth={1} className="text-admin-border" />;
      })}
      {series[0].axes.map((axis, i) => {
        const [x, y] = pointOnAxis(i, count, 1, radius, center);
        return <line key={axis.label} x1={center} y1={center} x2={x} y2={y} stroke="currentColor" strokeWidth={1} className="text-admin-border" />;
      })}
      {series.map((s) => {
        const points = s.axes.map((a, i) => pointOnAxis(i, count, a.maxValue > 0 ? a.value / a.maxValue : 0, radius, center).join(",")).join(" ");
        return (
          <polygon
            key={s.label}
            points={points}
            fill="currentColor"
            fillOpacity={0.18}
            stroke="currentColor"
            strokeWidth={2}
            className={s.colorClassName}
          />
        );
      })}
      {series[0].axes.map((axis, i) => {
        const [x, y] = pointOnAxis(i, count, 1.15, radius, center);
        return (
          <text key={axis.label} x={x} y={y} textAnchor="middle" dominantBaseline="middle" className="fill-admin-muted text-[10px] font-semibold">
            {axis.label}
          </text>
        );
      })}
    </svg>
  );
}
