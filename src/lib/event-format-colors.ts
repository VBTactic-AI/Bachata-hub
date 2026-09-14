import type { EventFormat } from "@prisma/client";

// Общий цвет-акцент на формат события — используется и в календаре на
// главной (EventCalendar.tsx), и в живой ленте /admin (LiveEventsFeed.tsx),
// чтобь один и тот же формат везде выглядел одинаково. Не токен темы (как и
// PLACE_COLORS в FinalJudgingScreen, CLAUDE.md §64.4) — фиксированный
// семантический акцент поверх night-*/admin-*.
export const EVENT_FORMAT_COLOR: Record<EventFormat, string> = {
  PARTY: "#ff2d8a",
  MASTERCLASS: "#38bdf8",
  FESTIVAL: "#fbbf24",
  CONTEST: "#a78bfa",
  INTENSIVE: "#34d399",
  // Events Engine (2026-09-15) — новые форматы, см. EventFormat в schema.prisma.
  SOCIAL: "#f472b6",
  OPEN_AIR: "#4ade80",
  PRACTICE: "#60a5fa",
  OTHER: "#94a3b8",
};
