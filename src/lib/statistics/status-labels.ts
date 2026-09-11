import type { StatusBadgeVariant } from "@/components/admin/StatusBadge";

// Переводы числовых судейских метрик (docs/00_DECISIONS.md A24) в понятные
// словесные статусы — по прямому запросу пользователя (2026-09-11): "кому
// надо цифры увидят цифры, а кому нет — статусами будет нагляднее". Числа
// НИКУДА не пропадают — статус всегда показывается РЯДОМ с цифрой, не вместо
// неё (JudgeStatisticsPanel.tsx).
//
// Конкретные пороги (границы диапазонов) нигде не описаны в CLAUDE.md/docs —
// как и формулы самих метрик (A24), выбраны исполнителем как разумная эвристика,
// не бизнес-правило конкурса: они влияют только на подпись в интерфейсе
// организатора, не на результаты соревнования. Если пороги окажутся неудобными
// на реальных данных — их можно поправить в одном месте (здесь), ничего
// пересчитывать не нужно.
export type Band = {
  /** Верхняя граница диапазона (включительно). Infinity — открытый верхний край. */
  max: number;
  label: string;
  variant: StatusBadgeVariant;
};

function bandFor(value: number, bands: Band[]): Band {
  return bands.find((b) => value <= b.max) ?? bands[bands.length - 1];
}

// --- Согласие с панелью: ранговая корреляция Спирмена, -1..1 ---
// Показываем со знаком в процентах (как попросил пользователь: "чем ближе
// к 1 тем больше %, чем ниже тем столько же со знаком -").
export const AGREEMENT_BANDS: Band[] = [
  { max: -0.001, label: "Расходится с панелью", variant: "danger" },
  { max: 0.4, label: "Слабое согласие", variant: "warning" },
  { max: 0.7, label: "Умеренное согласие", variant: "neutral" },
  { max: Infinity, label: "Высокое согласие", variant: "success" },
];
export function agreementPercentLabel(value: number | null): string {
  if (value === null) return "—";
  const pct = Math.round(value * 100);
  return `${pct > 0 ? "+" : ""}${pct}%`;
}
export function agreementBand(value: number | null): Band | null {
  return value === null ? null : bandFor(value, AGREEMENT_BANDS);
}

// --- Разброс оценок: стандартное отклонение на нормализованной шкале 0..1 ---
// Чем шире разброс, тем сильнее судья "прыгает" между низкими и высокими
// оценками (или тем сильнее реально отличались танцоры).
export const SPREAD_BANDS: Band[] = [
  { max: 0.08, label: "Очень ровный", variant: "success" },
  { max: 0.15, label: "Ровный", variant: "success" },
  { max: 0.22, label: "Средний разброс", variant: "neutral" },
  { max: 0.3, label: "Сильный разброс", variant: "warning" },
  { max: Infinity, label: "Очень сильный разброс", variant: "danger" },
];
export function spreadBand(value: number | null): Band | null {
  return value === null ? null : bandFor(value, SPREAD_BANDS);
}

// --- Доля выбросов: 0..1 ---
export const OUTLIER_BANDS: Band[] = [
  { max: 0, label: "Не отклонялся", variant: "success" },
  { max: 0.15, label: "Редко расходится", variant: "success" },
  { max: 0.35, label: "Иногда расходится", variant: "neutral" },
  { max: 0.6, label: "Часто расходится", variant: "warning" },
  { max: Infinity, label: "Систематически расходится", variant: "danger" },
];
export function outlierBand(value: number | null): Band | null {
  return value === null ? null : bandFor(value, OUTLIER_BANDS);
}

// --- Средний балл судьи: 0..1 (доля от максимума шкалы) ---
// Не "хорошо"/"плохо" — просто строгий судья или мягкий, поэтому только
// нейтральные тона (neutral/warning), без success/danger.
export const AVERAGE_SCORE_BANDS: Band[] = [
  { max: 0.4, label: "Очень строгий", variant: "warning" },
  { max: 0.6, label: "Строгий", variant: "neutral" },
  { max: 0.8, label: "Средний", variant: "neutral" },
  { max: 0.92, label: "Мягкий", variant: "neutral" },
  { max: Infinity, label: "Очень мягкий", variant: "warning" },
];
export function averageScoreBand(value: number | null): Band | null {
  return value === null ? null : bandFor(value, AVERAGE_SCORE_BANDS);
}
