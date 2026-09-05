"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
  // UX-005: раньше initial state читался прямо из localStorage внутри
  // ленивого инициализатора useState — на сервере getQueuedScore всегда
  // возвращает undefined (typeof window === "undefined"), а на клиенте,
  // если что-то реально осталось в очереди с офлайн-сессии, первый рендер
  // отличался бы от серверного HTML (hydration mismatch). Чтение вынесено в
  // подписку внутри useEffect — она гарантированно выполняется уже после
  // гидратации и синхронно отдаёт текущее состояние очереди при подписке.
  const [pending, setPending] = useState<ReturnType<typeof getQueuedScore>>(undefined);
  const [error, setError] = useState<string | null>(null);
  // UX-001: раньше "wasPending" читался из состояния React, захваченного в
  // замыкание эффекта ОДИН раз при монтировании (зависимость эффекта —
  // только drawParticipantId) — эффект никогда не пересоздавался при смене
  // pending, поэтому "было ли это в очереди только что" почти всегда было
  // равно самому первому значению (обычно undefined), и условие ниже
  // фактически никогда не срабатывало по-настоящему. Ref не участвует в
  // зависимостях эффекта и всегда читает актуальное значение — тот же
  // приём, что и pendingKeysRef в FinalJudgingScreen.tsx.
  const wasPendingRef = useRef(false);

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

  // Да/Нет — крупные кнопки на всю ширину карточки (по макету JBJ Platform,
  // экран "СУДЬЯ: ОТБОР") — судья тапает по телефону в живом эфире, крупная
  // цель важнее компактности (CLAUDE.md §40, UX-006).
  const isYesNo = maxValue === 1;

  return (
    <div className="flex flex-col gap-1.5">
      <div className={isYesNo ? "grid grid-cols-2 gap-2.5" : "flex flex-wrap gap-1.5"}>
        {options.map((v) => {
          const active = savedValue === v;
          const yesActive = isYesNo && v === 1 && active;
          const noActive = isYesNo && v === 0 && active;
          return (
            <button
              key={v}
              type="button"
              disabled={locked}
              onClick={() => enqueueJudgeScore(drawParticipantId, v)}
              className={`rounded-app-sm border font-night text-sm font-bold uppercase tracking-wide transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                isYesNo ? "min-h-[52px]" : "min-h-[44px] min-w-[52px] px-4"
              } ${
                yesActive
                  ? "border-night-success bg-night-success/15 text-night-success"
                  : noActive
                    ? "border-red-400 bg-red-400/15 text-red-400"
                    : active
                      ? "border-night-primary bg-night-primary/15 text-night-primary"
                      : "border-night-border bg-night-card2 text-night-muted hover:border-night-primary/60 hover:text-night-text"
              }`}
            >
              {labelFor(v)}
            </button>
          );
        })}
      </div>
      {locked && <span className="text-xs text-night-muted">зафиксировано</span>}
      {!locked && pending && <span className="text-xs text-night-muted">ждёт отправки…</span>}
      {!locked && !pending && savedValue !== null && !error && <span className="text-xs text-night-muted">сохранено</span>}
      {!locked && error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}
