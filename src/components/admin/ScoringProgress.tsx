// Реальный прогресс (не выдуманный) — required/submitted считаются на
// сервере из фактических JudgeAssignment/JudgeScore (Этап 7).
export function ScoringProgress({ required, submitted }: { required: number; submitted: number }) {
  const pct = required === 0 ? 100 : Math.round((submitted / required) * 100);
  return (
    <div className="mt-2">
      <p className="hint-text">
        Подсчёт баллов: {submitted} из {required} оценок собрано ({pct}%)
      </p>
      <div className="h-2 w-full overflow-hidden rounded-full bg-line">
        <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
