// Декоративный фон всей админ-панели (2026-09-11, по прямому запросу
// пользователя) — фиксированный на весь вьюпорт (z-0, см. .jnj-ambient-bg в
// globals.css), сам ничего не решает и никак не влияет на бизнес-логику.
// Кладётся ОДИН раз в admin/layout.tsx — виден сквозь полупрозрачные
// поверхности (AdminSidebar на десктопе — bg-admin-card/30) и позади всех
// непрозрачных карточек, автоматически оказываясь за любым содержимым
// страницы благодаря z-index-схеме без отрицательных значений (тот же приём,
// что и в исправлении фона главной страницы, src/app/page.tsx).
export function JnjAmbientBackground() {
  return (
    <div className="jnj-ambient-bg" aria-hidden="true">
      <div className="jnj-light jnj-light--purple" />
      <div className="jnj-light jnj-light--gold" />
      <div className="jnj-vignette" />
      <div className="jnj-grain" />
    </div>
  );
}
