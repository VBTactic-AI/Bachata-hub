// Визуальный прогресс-бар вместо голого текста "N из M" (2026-09-10, по
// запросу пользователя). Чистая презентация — pct считает вызывающий код,
// здесь только отрисовка; та же логика "прогресс настоящий, не выдуманный"
// (CLAUDE.md §53), что и у ScoringProgress.tsx на стороне организатора.
export function ProgressBar({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-admin-border">
      <div className="h-full rounded-full bg-gradient-admin-cta transition-all" style={{ width: `${clamped}%` }} />
    </div>
  );
}
