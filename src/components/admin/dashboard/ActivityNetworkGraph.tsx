"use client";

import { useEffect, useState } from "react";
import type { CityActivity } from "@/lib/admin-dashboard";

// "Сеть активности" — абстрактная визуализация вместо географической карты
// Беларуси (пользователь предложил оба варианта, редизайн 2026-09-12): узел в
// центре — сама платформа, лучи — реальные города с активными событиями
// (данные из getCityActivityNetwork, CLAUDE.md §19 — ничего не выдумано).
// Размер узла города и подпись — единственное, что зависит от данных;
// анимация (пульс узлов, "сигнал" по линиям) — чистый SVG SMIL, decorative
// only, не требует JS/поллинга (числа обновляются при обычной загрузке
// страницы, как и остальной дашборд).
//
// "use client" + mounted-гейт (а не обычный server component) — найдено
// вживую (2026-09-12): нативные SVG-анимации (<animate>/<animateMotion>)
// стартуют сразу при парсинге DOM, ДО того как React успевает сверить
// разметку при гидратации — React видит, что атрибут "r"/"opacity" уже не
// совпадает со снимком, снятым на сервере, и падает с Hydration failed
// (реальная, не гипотетическая ошибка, воспроизведена в браузере). Решение:
// первый рендер клиента идентичен серверному (без единого <animate>-тега),
// анимационные элементы добавляются отдельным setState ПОСЛЕ монтирования —
// это обычное обновление DOM после гидратации, не гидратация как таковая.
const VIEW_W = 520;
const VIEW_H = 320;
const HUB_X = VIEW_W / 2;
const HUB_Y = VIEW_H / 2;
const RADIUS = 130;
const MIN_NODE_R = 12;
const MAX_NODE_R = 30;

function nodePosition(index: number, total: number) {
  const angle = (index / total) * Math.PI * 2 - Math.PI / 2;
  return { x: HUB_X + Math.cos(angle) * RADIUS, y: HUB_Y + Math.sin(angle) * RADIUS };
}

export function ActivityNetworkGraph({ cities }: { cities: CityActivity[] }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (cities.length === 0) {
    return <p className="m-0 text-sm text-admin-muted">Нет активных городов.</p>;
  }

  const maxEvents = Math.max(1, ...cities.map((c) => c.eventsCount));

  return (
    <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="h-auto w-full" role="img" aria-label="Сеть активности по городам">
      <defs>
        <radialGradient id="hub-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#60a5fa" stopOpacity="0" />
        </radialGradient>
      </defs>

      {cities.map((city, i) => {
        const pos = nodePosition(i, cities.length);
        return (
          <line
            key={`line-${city.id}`}
            x1={HUB_X}
            y1={HUB_Y}
            x2={pos.x}
            y2={pos.y}
            stroke="#3b82f6"
            strokeWidth="1.25"
            opacity="0.35"
          />
        );
      })}

      {mounted &&
        cities.map((city, i) => {
          if (city.eventsCount === 0) return null;
          const pos = nodePosition(i, cities.length);
          return (
            <circle key={`pulse-${city.id}`} r="3" fill="#93c5fd">
              <animateMotion dur={`${2.4 + (i % 3) * 0.5}s`} repeatCount="indefinite" path={`M ${HUB_X} ${HUB_Y} L ${pos.x} ${pos.y}`} />
              <animate attributeName="opacity" values="0;1;0" dur={`${2.4 + (i % 3) * 0.5}s`} repeatCount="indefinite" />
            </circle>
          );
        })}

      <circle cx={HUB_X} cy={HUB_Y} r="46" fill="url(#hub-glow)" />
      <circle cx={HUB_X} cy={HUB_Y} r="15" fill="#3b82f6">
        {mounted && <animate attributeName="r" values="15;18;15" dur="2.6s" repeatCount="indefinite" />}
      </circle>
      <g>
        <title>Bachata HUB</title>
        <circle cx={HUB_X} cy={HUB_Y} r="15" fill="none" stroke="#93c5fd" strokeWidth="1.5" opacity="0.6" />
      </g>

      {cities.map((city, i) => {
        const pos = nodePosition(i, cities.length);
        const r = MIN_NODE_R + (MAX_NODE_R - MIN_NODE_R) * Math.sqrt(city.eventsCount / maxEvents);
        const hasActivity = city.eventsCount > 0;
        return (
          <g key={city.id}>
            {/* <title> — прямой ребёнок <g>, единственная текстовая строка
                (не разбита на несколько JSX-выражений/строк): найдено вживую
                (2026-09-12) — интерполяция в несколько строк внутри <title>
                внутри <circle> ловила Hydration failed из-за расхождения
                текстовых узлов между серверным и клиентским рендером SVG. */}
            <title>{`${city.name}: ${city.eventsCount} предстоящих событий, ${city.schoolsCount} активных школ`}</title>
            <circle
              cx={pos.x}
              cy={pos.y}
              r={r}
              fill={hasActivity ? "#8b5cf6" : "#131a2c"}
              stroke={hasActivity ? "#a78bfa" : "#1f2a44"}
              strokeWidth="1.5"
            />
            <text x={pos.x} y={pos.y + 4} textAnchor="middle" fontSize="12" fontWeight="700" fill="#ffffff">
              {city.eventsCount}
            </text>
            <text x={pos.x} y={pos.y + r + 16} textAnchor="middle" fontSize="11" fill="#8b95b3">
              {city.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
