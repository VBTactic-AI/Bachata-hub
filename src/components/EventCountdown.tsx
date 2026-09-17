"use client";

import { useEffect, useState } from "react";
import { LiveDot } from "@/components/LiveDot";

// Показываем точный отсчёт только для событий, которые начнутся в ближайшую
// неделю — дальше он не несёт пользы (никто не считает "через 240 часов"),
// а грубую дистанцию уже даёт formatRelativeDayLabel рядом на странице.
const SOON_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

export function EventCountdown({ startsAt }: { startsAt: string }) {
  // До монтирования на клиенте ничего не считаем — иначе серверный рендер
  // (без Date.now()) разойдётся с клиентским при гидрации.
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (now === null) return null;

  const diff = new Date(startsAt).getTime() - now;
  if (diff <= 0 || diff > SOON_THRESHOLD_MS) return null;

  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-night-muted">
      <LiveDot />
      через{" "}
      <span className="tabular-nums text-night-text">
        {days > 0 && `${days} д `}
        {hours} ч {minutes} м
      </span>
    </span>
  );
}
