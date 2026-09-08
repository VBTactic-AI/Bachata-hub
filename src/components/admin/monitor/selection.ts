import type { HeatStatus, RoundStatus } from "@prisma/client";

// Что монитор открывает сам, без клика организатора. Правило одно: показать
// то, что происходит ПРЯМО СЕЙЧАС, иначе — ближайшее незакрытое, иначе —
// последнее. Вынесено отдельной чистой функцией (а не спрятано в useState
// внутри компонента), потому что "какой этап сейчас главный" — это правило
// прогона соревнования, и оно должно быть проверяемо тестами.

// Раунд "в работе": уже вышел из покоя, но ещё не закрыт. PAUSED и SCORING
// сюда входят намеренно — пауза на паркете и сбор оценок это ровно те
// моменты, ради которых монитор и открывают.
const ACTIVE_ROUND_STATUSES = new Set<RoundStatus>(["DRAWING", "DRAW_LOCKED", "RUNNING", "PAUSED", "SCORING"]);

type RoundLike = { id: string; status: RoundStatus };
type HeatLike = { id: string; status: HeatStatus };
type CategoryLike = { id: string; rounds: RoundLike[] };

export function hasActiveRound(rounds: RoundLike[]): boolean {
  return rounds.some((r) => ACTIVE_ROUND_STATUSES.has(r.status));
}

export function defaultRoundId(rounds: RoundLike[]): string | null {
  if (rounds.length === 0) return null;
  const active = rounds.find((r) => ACTIVE_ROUND_STATUSES.has(r.status));
  if (active) return active.id;
  const pending = rounds.find((r) => r.status !== "COMPLETED");
  if (pending) return pending.id;
  return rounds[rounds.length - 1].id;
}

export function defaultCategoryId(categories: CategoryLike[]): string | null {
  if (categories.length === 0) return null;
  const live = categories.find((c) => hasActiveRound(c.rounds));
  if (live) return live.id;
  const unfinished = categories.find((c) => c.rounds.some((r) => r.status !== "COMPLETED"));
  if (unfinished) return unfinished.id;
  return categories[0].id;
}

export function defaultHeatId(heats: HeatLike[]): string | null {
  if (heats.length === 0) return null;
  const running = heats.find((h) => h.status === "RUNNING") ?? heats.find((h) => h.status === "PAUSED");
  if (running) return running.id;
  const pending = heats.find((h) => h.status === "PENDING");
  if (pending) return pending.id;
  return heats[heats.length - 1].id;
}

// Выбор организатора живёт в состоянии клиента и переживает router.refresh()
// после каждого действия — но сама сущность может из данных исчезнуть
// (заход унесли в "Разбить на 2 выхода", раунд пересобрали). Тогда молча
// падать нельзя и "прыгать на первый попавшийся" тоже: возвращаемся ровно к
// тому же правилу, что и при первом открытии.
export function resolveSelected<T extends { id: string }>(items: T[], selectedId: string | null, fallbackId: string | null): T | null {
  if (items.length === 0) return null;
  const chosen = selectedId ? items.find((i) => i.id === selectedId) : undefined;
  if (chosen) return chosen;
  const fallback = fallbackId ? items.find((i) => i.id === fallbackId) : undefined;
  return fallback ?? items[0];
}
