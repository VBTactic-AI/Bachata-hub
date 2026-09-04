"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { enqueueJudgeScore, getQueuedScore, subscribeJudgeScoreQueue } from "@/components/admin/judging/judge-score-queue";

// Мобильный судейский UI (CLAUDE.md §40) — быстро выбрать оценку и увидеть
// статус отправки, без админских функций рядом. Отправка идёт через
// офлайн-очередь (CLAUDE.md §17) — клик сохраняет оценку локально и пробует
// отправить сразу; если связи нет, кнопка покажет «ждёт отправки», и очередь
// досошлёт её сама, когда связь вернётся.
export function JudgeScoreButtons({ drawParticipantId, maxValue, myScore }: { drawParticipantId: string; maxValue: number; myScore: number | null }) {
  const router = useRouter();
  const [pending, setPending] = useState(() => getQueuedScore(drawParticipantId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return subscribeJudgeScoreQueue((state) => {
      const item = state.queue.find((q) => q.drawParticipantId === drawParticipantId);
      const wasPending = pending !== undefined;
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

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {options.map((v) => (
        <Button key={v} type="button" size="sm" variant={savedValue === v ? "default" : "outline"} onClick={() => enqueueJudgeScore(drawParticipantId, v)}>
          {v}
        </Button>
      ))}
      {pending && <span className="hint-text">ждёт отправки…</span>}
      {!pending && savedValue !== null && !error && <span className="hint-text">сохранено</span>}
      {error && <span className="error-text">{error}</span>}
    </span>
  );
}
