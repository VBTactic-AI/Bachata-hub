"use client";

import { useEffect, useState } from "react";
import { subscribeJudgeScoreQueue } from "@/components/admin/judging/judge-score-queue";

// Общий статус наверху судейской страницы (CLAUDE.md §40 — судья должен
// видеть статус отправки, не только по одной кнопке за раз): сколько оценок
// ещё не доставлено до сервера, и онлайн ли вообще телефон судьи.
export function JudgingQueueBanner() {
  const [pendingCount, setPendingCount] = useState(0);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    const unsubscribe = subscribeJudgeScoreQueue((state) => setPendingCount(state.queue.length));
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      unsubscribe();
    };
  }, []);

  if (online && pendingCount === 0) return null;

  return (
    <div className="rounded-app-sm border border-line bg-amber-50 p-2 text-sm text-amber-900">
      {!online && <p>Нет связи — оценки сохраняются на телефоне и отправятся сами, когда связь вернётся.</p>}
      {pendingCount > 0 && <p>Не отправлено оценок: {pendingCount}.</p>}
    </div>
  );
}
