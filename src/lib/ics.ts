// Генерация одного VEVENT для "Добавить в календарь" на карточке события
// (2026-09-19). Чистый модуль без Prisma/Next — легко тестируется отдельно
// от роута, который его вызывает.

// RFC 5545 §3.3.11 — экранирование текстовых полей: обратный слэш и
// разделители ДО переноса строки, иначе сам экранирующий слэш задвоился бы.
function escapeIcsText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

// UTC basic-формат (YYYYMMDDTHHMMSSZ) — не полагаемся на локальную таймзону
// клиента-календаря, время события уже в UTC на сервере (Prisma Date).
function formatIcsDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export type IcsEventInput = {
  uid: string;
  title: string;
  description?: string | null;
  location?: string | null;
  startsAt: Date;
  endsAt?: Date | null;
  url?: string | null;
};

// Событие без endsAt получает условную длительность 2 часа — валидный VEVENT
// требует DTEND либо DURATION, у части событий Event Engine endsAt не
// обязателен (см. комментарий у Event.endsAt в schema.prisma).
const DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000;

export function buildIcsEvent(input: IcsEventInput): string {
  const end = input.endsAt ?? new Date(input.startsAt.getTime() + DEFAULT_DURATION_MS);

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Bachata HUB//Events//RU",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${input.uid}`,
    `DTSTAMP:${formatIcsDate(new Date())}`,
    `DTSTART:${formatIcsDate(input.startsAt)}`,
    `DTEND:${formatIcsDate(end)}`,
    `SUMMARY:${escapeIcsText(input.title)}`,
  ];
  if (input.description) lines.push(`DESCRIPTION:${escapeIcsText(input.description)}`);
  if (input.location) lines.push(`LOCATION:${escapeIcsText(input.location)}`);
  if (input.url) lines.push(`URL:${input.url}`);
  lines.push("END:VEVENT", "END:VCALENDAR");

  // CRLF — обязателен по RFC 5545, не просто "\n" (некоторые почтовые/
  // календарные клиенты на Windows иначе показывают событие без переносов).
  return lines.join("\r\n") + "\r\n";
}
