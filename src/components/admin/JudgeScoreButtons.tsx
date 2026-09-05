"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { enqueueJudgeScore, getQueuedScore, subscribeJudgeScoreQueue } from "@/components/admin/judging/judge-score-queue";

// Мобильный судейский UI (CLAUDE.md §40) — быстро выбрать оценку и увидеть
// статус отправки, без админских функций рядом. Отправка идёт через
// офлайн-очередь (CLAUDE.md §17) — клик сохраняет оценку локально и пробует
// отправить сразу; если связи нет, кнопка покажет «ждёт отправки», и очередь
// досошлёт её сама, когда связь вернётся.
export function JudgeScoreButtons({
  drawParticipantId,
  maxValue,
  myScore,
  locked,
}: {
  drawParticipantId: string;
  maxValue: number;
  myScore: number | null;
  // Судья уже нажал "Готово" по этому раунду — сервер такие изменения всё
  // равно отклонит, но кнопки лучше сразу показать неактивными, а не ждать
  // ошибки от клика (2026-09-04).
  locked?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(() => getQueuedScore(drawParticipantId));
  const [error, setError] = useState<string | null>(null);
  // UX-001: раньше "wasPending" читался из состояния React, захваченного в
  // замыкание эффекта ОДИН раз при монтировании (зависимость эффекта —
  // только drawParticipantId) — эффект никогда не пересоздавался при смене
  // pending, поэтому "было ли это в очереди только что" почти всегда было
  // равно самому первому значению (обычно undefined), и условие ниже
  // фактически никогда не срабатывало по-настоящему. Ref не участвует в
  // зависимостях эффекта и всегда читает актуальное значение — тот же
  // приём, что и pendingKeysRef в FinalJudgingScreen.tsx.
  const wasPendingRef = useRef(pending !== undefined);

  useEffect(() => {
    return subscribeJudgeScoreQueue((state) => {
      const item = state.queue.find((q) => q.drawParticipantId === drawParticipantId);
      const wasPending = wasPendingRef.current;
      wasPendingRef.current = item !== undefined;
      setPending(item);
      setError(state.errors[drawParticipantId] ?? null);
      if (wasPending && !item && !state.errors[drawParticipantId]) {
        // Очередь только что доставила эту оценку до сервера — подтянуть
        // актуальное состояние (список судей/прогресс мог измениться).
        router.refresh();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawParticipantId]);

  const savedValue = pending ? pending.value : myScore;
  const options = Array.from({ length: maxValue + 1 }, (_, v) => v);
  // Формат 0/1 на практике — это "пропустить дальше или нет", "Да/Нет"
  // читается судье понятнее двух цифр (по запросу пользователя, 2026-09-04).
  // Шкала 0/1/2 остаётся числовой — там это не бинарный выбор.
  const labelFor = (v: number) => (maxValue === 1 ? (v === 1 ? "Да" : "Нет") : String(v));

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {options.map((v) => (
        <Button
          key={v}
          type="button"
          size="sm"
          variant={savedValue === v ? "default" : "outline"}
          disabled={locked}
          onClick={() => enqueueJudgeScore(drawParticipantId, v)}
        >
          {labelFor(v)}
        </Button>
      ))}
      {locked && <span className="hint-text">зафиксировано</span>}
      {!locked && pending && <span className="hint-text">ждёт отправки…</span>}
      {!locked && !pending && savedValue !== null && !error && <span className="hint-text">сохранено</span>}
      {!locked && error && <span className="error-text">{error}</span>}
    </span>
  );
}
