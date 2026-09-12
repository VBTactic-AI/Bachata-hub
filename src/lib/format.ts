const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "long",
  weekday: "short",
});
const timeFormatter = new Intl.DateTimeFormat("ru-RU", {
  hour: "2-digit",
  minute: "2-digit",
});

export function formatEventDate(date: Date) {
  return dateFormatter.format(date);
}

export function formatEventTime(date: Date) {
  return timeFormatter.format(date);
}

export function formatDateTime(date: Date) {
  return `${formatEventDate(date)}, ${formatEventTime(date)}`;
}

// Короткий "плашечный" лейбл для карточки события ("сегодня", "завтра",
// "через N дн.") — сознательно без склонения числительного (как в афишах),
// поэтому не нужен pluralizeRu и не рискуем ошибиться со склонением.
export function formatRelativeDayLabel(date: Date, now: Date = new Date()): string | null {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(date) - startOfDay(now)) / 86_400_000);
  if (diffDays < 0) return null;
  if (diffDays === 0) return "Сегодня";
  if (diffDays === 1) return "Завтра";
  if (diffDays <= 30) return `Через ${diffDays} дн.`;
  return null;
}

// Размер БД для карточки "Состояние базы" (админка) — реальные байты из
// pg_database_size(), просто отформатированные для человека.
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  const units = ["КБ", "МБ", "ГБ", "ТБ"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

// Относительное время для "живых" лент (админка) — "N мин назад" и т.д.
// Округление вниз намеренно (событие, добавленное 30 секунд назад, должно
// показывать "0 мин назад", а не "1 мин назад" — не приукрашиваем свежесть).
export function formatTimeAgo(date: Date, now: Date = new Date()): string {
  const diffSec = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));
  if (diffSec < 60) return "только что";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} ${pluralizeRu(diffMin, ["минуту", "минуты", "минут"])} назад`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} ${pluralizeRu(diffHours, ["час", "часа", "часов"])} назад`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays} ${pluralizeRu(diffDays, ["день", "дня", "дней"])} назад`;
  return formatEventDate(date);
}

// Стандартное склонение существительного после числительного в русском
// языке: forms = [1 штука, 2-4 штуки, 5+ штук], напр. ["событие", "события", "событий"].
export function pluralizeRu(count: number, forms: readonly [string, string, string]): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return forms[1];
  return forms[2];
}
