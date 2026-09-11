// "Card Light Sweep" — диагональный блик поверх карточки (2026-09-11, по
// прямому запросу пользователя для карточек событий/школ на главной, эффект
// "стеклянных карточек"). Сама анимация (tailwind.config.ts, `card-sweep`)
// большую часть цикла "припаркована" за левым краем (не видна) и раз в ~4с
// пробегает по диагонали — ambient-повтор, работает одинаково на hover
// (desktop) и без него (мобильный, CLAUDE.md §40 — там наведения нет).
// `sweepDelay` расфазирует несколько карточек в одной ленте, чтобы не
// мигали синхронно; родитель должен быть `relative` (и лучше `overflow-hidden`
// на случай смещения контента) — сам блик клипуется своим же `rounded-[inherit]`.
export function CardLightSweep({ sweepDelay = 0 }: { sweepDelay?: number }) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 rounded-[inherit] bg-card-sweep bg-[length:250%_100%] animate-card-sweep motion-reduce:hidden"
      style={{ animationDelay: `${sweepDelay}s` }}
    />
  );
}
