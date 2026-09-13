import type { Metadata } from "next";
import { t } from "@/lib/i18n/dictionary";

export const metadata: Metadata = {
  title: t.rating.title,
};

// Пункт меню "Рейтинг" уже добавлен в навигацию (по референсу пользователя),
// но самого рейтинга танцоров в проекте пока нет — ни модели очков, ни
// расчёта (CLAUDE.md §38, §60: не хардкодим points, не выдумываем алгоритм
// молча). Честная заглушка вместо фейковых данных/списка — реализация
// рейтинга требует отдельного решения (какие соревнования/периоды считать,
// как начислять очки), которое ещё не принято.
export default function RatingPage() {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <h1 className="m-0 font-night text-xl font-extrabold text-night-text sm:text-2xl">{t.rating.title}</h1>
      <p className="m-0 max-w-md text-sm text-night-muted">{t.rating.description}</p>
      <span className="mt-2 rounded-full border border-night-border px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-night-muted">
        {t.rating.comingSoon}
      </span>
    </div>
  );
}
