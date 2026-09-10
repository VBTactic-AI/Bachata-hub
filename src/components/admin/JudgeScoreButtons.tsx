"use client";

import { useEffect, useState } from "react";
import { enqueueJudgeScore, getQueuedScore, subscribeJudgeScoreQueue } from "@/components/admin/judging/judge-score-queue";

// Мобильный судейский UI (CLAUDE.md §40) — быстро выбрать оценку по номеру
// участника, без лишнего на экране. Отправка идёт через офлайн-очередь
// (CLAUDE.md §17) — клик сохраняет оценку локально и пробует отправить сразу;
// если связи нет, очередь досылает её сама, когда связь вернётся. Судья это
// не видит построчно (по запросу пользователя, 2026-09-10) — очередь работает
// "под капотом"; единственное, что показывается — реальная ошибка сервера
// (не сетевая), которая требует действия судьи. Общий статус связи/очереди —
// баннер наверху страницы (JudgingQueueBanner), не эта кнопка.
export function JudgeScoreButtons({
  drawParticipantId,
  bibNumber,
  maxValue,
  myScore,
  locked,
}: {
  drawParticipantId: string;
  bibNumber: string | null;
  maxValue: number;
  myScore: number | null;
  // Судья уже нажал "Готово" по этому раунду — сервер такие изменения всё
  // равно отклонит, но кнопки лучше сразу показать неактивными, а не ждать
  // ошибки от клика (2026-09-04).
  locked?: boolean;
}) {
  // UX-005: раньше initial state читался прямо из localStorage внутри
  // ленивого инициализатора useState — на сервере getQueuedScore всегда
  // возвращает undefined (typeof window === "undefined"), а на клиенте,
  // если что-то реально осталось в очереди с офлайн-сессии, первый рендер
  // отличался бы от серверного HTML (hydration mismatch). Чтение вынесено в
  // подписку внутри useEffect — она гарантированно выполняется уже после
  // гидратации и синхронно отдаёт текущее состояние очереди при подписке.
  const [pending, setPending] = useState<ReturnType<typeof getQueuedScore>>(undefined);
  const [error, setError] = useState<string | null>(null);

  // router.refresh() после доставки оценки — не отсюда: одна такая кнопка на
  // экране далеко не одна (см. judging/[competitionId]/page.tsx), и если
  // каждая сама дёргает router.refresh(), быстрая серия тапов или догон
  // очереди после офлайна превращается в шторм последовательных RSC-рефетчей
  // одной и той же страницы (жалоба пользователя на "лаги", 2026-09-07).
  // Один дебаунсящий подписчик на всю страницу — JudgeQueueRefresher.
  useEffect(() => {
    return subscribeJudgeScoreQueue((state) => {
      const item = state.queue.find((q) => q.drawParticipantId === drawParticipantId);
      setPending(item);
      setError(state.errors[drawParticipantId] ?? null);
    });
  }, [drawParticipantId]);

  const savedValue = pending ? pending.value : myScore;
  // Визуальный дефолт "0"/"Нет" (по прямому запросу пользователя, 2026-09-10:
  // "где Да/Нет — там всегда горит Нет, надо нажать Да") — ТОЛЬКО подсветка
  // кнопки, не запись в БД: savedValue (реальное состояние, влияющее на
  // "сохранено"/прогресс на мониторе) остаётся null, пока судья не нажмёт
  // сам. CLAUDE.md §16/§60 запрещает молча превращать отсутствующую оценку в
  // 0 — здесь оценка по-прежнему отсутствует до реального клика, меняется
  // только то, какая кнопка выглядит нажатой.
  const displayValue = savedValue ?? 0;
  const options = Array.from({ length: maxValue + 1 }, (_, v) => v);
  // Формат 0/1 на практике — это "пропустить дальше или нет", "Да/Нет"
  // читается судье понятнее двух цифр (по запросу пользователя, 2026-09-04).
  // Шкала 0/1/2 остаётся числовой — там это не бинарный выбор.
  const labelFor = (v: number) => (maxValue === 1 ? (v === 1 ? "Да" : "Нет") : String(v));
  const isYesNo = maxValue === 1;

  return (
    <div className="flex flex-col gap-1">
      <div className={`flex items-center gap-2 rounded-app-sm border border-admin-border bg-admin-card2 p-1.5 transition-opacity ${locked ? "opacity-50" : ""}`}>
        {/* Номер — главный визуальный якорь (по запросу пользователя,
            2026-09-10 — судья на танцполе ищет по нагрудному номеру, не по
            имени; имя не отображается вовсе). Кнопки — в строку рядом с
            номером, не отдельным блоком под именем, чтобы на экран помещалось
            больше участников. */}
        <span className="flex h-11 min-w-[44px] shrink-0 items-center justify-center rounded-app-sm bg-admin-bg px-1.5 font-mono text-base font-extrabold text-night-text">
          {bibNumber ?? "—"}
        </span>
        <div className={isYesNo ? "grid flex-1 grid-cols-2 gap-1.5" : "flex flex-1 flex-wrap gap-1.5"}>
          {options.map((v) => {
            const active = displayValue === v;
            const yesActive = isYesNo && v === 1 && active;
            const noActive = isYesNo && v === 0 && active;
            return (
              <button
                key={v}
                type="button"
                disabled={locked}
                onClick={() => enqueueJudgeScore(drawParticipantId, v)}
                className={`h-11 min-w-[44px] rounded-app-sm border font-night text-sm font-bold uppercase tracking-wide transition-colors disabled:cursor-not-allowed ${
                  isYesNo ? "" : "flex-1 px-3"
                } ${
                  yesActive
                    ? "border-night-success bg-night-success/15 text-night-success"
                    : noActive
                      ? "border-red-400 bg-red-400/15 text-red-400"
                      : active
                        ? "border-admin-primary bg-admin-primary/15 text-admin-primary"
                        : "border-admin-border bg-admin-bg text-admin-muted hover:border-admin-primary/60 hover:text-night-text"
                }`}
              >
                {labelFor(v)}
              </button>
            );
          })}
        </div>
      </div>
      {!locked && error && <p className="m-0 pl-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}
