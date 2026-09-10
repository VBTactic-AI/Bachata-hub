import type { RegistrationRole } from "@prisma/client";

// JUDGES_DANCE (финал "Танец с судьями", CLAUDE.md §64) — сквозная нумерация
// Heat.number на весь раунд (заход 1 = стадия "партнёры", заход 2 = стадия
// "партнёрши" и т.д., final-judges-dance.ts) специально не менялась в БД —
// она нужна правилу "заходы одного раунда обязаны идти строго по возрастанию
// number" (CLAUDE.md §45/A4). Но организатору и судье неочевидно видеть
// "Заход 3"/"Заход 4" у второй стадии, если первая уже заняла номера 1-2
// (несколько заходов на роль бывает, когда финалистов больше вместимости
// одного захода) — по прямому запросу пользователя (2026-09-11) нумерация на
// ЭКРАНЕ должна начинаться заново для каждой роли: "Заход 1"/"Заход 2" у
// партнёров и свой "Заход 1"/"Заход 2" у партнёрш. Чистая функция, только для
// отображения — реальный Heat.number/порядок запуска не меняет.
export type JudgesDanceHeatLike = { id: string; number: number; dancerRole: RegistrationRole | null };
export type JudgesDanceHeatDisplayNumber = { number: number; total: number };

export function computeJudgesDanceHeatNumbering(heats: JudgesDanceHeatLike[]): Map<string, JudgesDanceHeatDisplayNumber> {
  const sorted = [...heats].sort((a, b) => a.number - b.number);
  // dancerRole === null (заход ещё пуст, ни один вызванный участник не
  // определяет его роль) — не должен путать счётчик настоящих стадий, у
  // каждого такого захода свой уникальный ключ.
  const keyOf = (h: JudgesDanceHeatLike) => h.dancerRole ?? `__unknown_${h.id}`;

  const totals = new Map<string, number>();
  for (const h of sorted) {
    const key = keyOf(h);
    totals.set(key, (totals.get(key) ?? 0) + 1);
  }

  const counters = new Map<string, number>();
  const result = new Map<string, JudgesDanceHeatDisplayNumber>();
  for (const h of sorted) {
    const key = keyOf(h);
    const number = (counters.get(key) ?? 0) + 1;
    counters.set(key, number);
    result.set(h.id, { number, total: totals.get(key) ?? number });
  }
  return result;
}
