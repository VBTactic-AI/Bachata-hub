// Реальный прогресс (не выдуманный) — required/submitted считаются на
// сервере из фактических JudgeAssignment/JudgeScore (Этап 7).
//
// Живёт только внутри панелей раунда на /admin/competitions/[id] (Монитор) —
// admin-* палитра (CLAUDE.md §64.2, tailwind.config.ts), не общий компонент.
export function ScoringProgress({ required, submitted }: { required: number; submitted: number }) {
  const pct = required === 0 ? 100 : Math.round((submitted / required) * 100);
  return (
    <div>
      <p className="m-0 text-sm text-admin-muted">
        Подсчёт баллов: {submitted} из {required} оценок собрано ({pct}%)
      </p>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-admin-border">
        <div className="h-full bg-admin-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
