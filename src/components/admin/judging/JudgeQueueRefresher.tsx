"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { subscribeJudgeScoreDelivery } from "@/components/admin/judging/judge-score-queue";

// Один экземпляр на всю страницу судьи (не по одному на кнопку, см.
// judge-score-queue.ts) — дебаунсит router.refresh() после серии доставленных
// оценок в одно обновление вместо шторма последовательных RSC-рефетчей
// (жалоба пользователя на "лаги", 2026-09-07). Сам ничего не рендерит.
export function JudgeQueueRefresher() {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return subscribeJudgeScoreDelivery(() => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => router.refresh(), 400);
    });
  }, [router]);

  return null;
}
