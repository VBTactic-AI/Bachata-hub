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

// Стандартное склонение существительного после числительного в русском
// языке: forms = [1 штука, 2-4 штуки, 5+ штук], напр. ["событие", "события", "событий"].
export function pluralizeRu(count: number, forms: readonly [string, string, string]): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return forms[1];
  return forms[2];
}
