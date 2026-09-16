import type { RecurrenceRule } from "@/server/events/recurrence";

// Человекочитаемое описание правила повторения ("Каждую пятницу", "Каждые 2
// недели по Пн/Ср") — используется на карточке/странице серии. Чистая
// функция, безопасна и на сервере, и на клиенте.
const WEEKDAY_NAMES: Record<number, string> = { 0: "Вс", 1: "Пн", 2: "Вт", 3: "Ср", 4: "Чт", 5: "Пт", 6: "Сб" };

export function describeRecurrenceRule(rule: RecurrenceRule): string {
  const every = (n: number, one: string, few: string) => (n === 1 ? one : `Каждые ${n} ${few}`);

  switch (rule.frequency) {
    case "DAILY":
      return every(rule.interval, "Каждый день", "дня");
    case "WEEKLY": {
      const days = rule.daysOfWeek
        .slice()
        .sort((a, b) => a - b)
        .map((d) => WEEKDAY_NAMES[d])
        .join("/");
      return rule.interval === 1 ? `Каждую неделю по ${days}` : `Каждые ${rule.interval} недели по ${days}`;
    }
    case "MONTHLY": {
      const base = rule.interval === 1 ? "Каждый месяц" : `Каждые ${rule.interval} месяца`;
      if (rule.mode === "DAY_OF_MONTH") return `${base}, ${rule.dayOfMonth} число`;
      const nthLabel = rule.nth === -1 ? "последний" : ["", "первый", "второй", "третий", "четвёртый"][rule.nth];
      return `${base}, ${nthLabel} ${WEEKDAY_NAMES[rule.weekday]}`;
    }
  }
}
