"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { FeedEvent } from "@/lib/admin-dashboard";
import { t } from "@/lib/i18n/dictionary";
import { formatTimeAgo } from "@/lib/format";
import { EVENT_FORMAT_COLOR } from "@/lib/event-format-colors";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { LiveDot } from "@/components/LiveDot";

const POLL_MS = 25_000;

const MODERATION_BADGE: Record<FeedEvent["moderationStatus"], { label: string; variant: "success" | "warning" | "danger" }> = {
  APPROVED: { label: "Одобрено", variant: "success" },
  PENDING: { label: "На модерации", variant: "warning" },
  REJECTED: { label: "Отклонено", variant: "danger" },
};

// "Живая лента" — тот же паттерн опроса, что и RotationPanel/live-танцпол
// (docs/00_DECISIONS.md A12): сервер отдаёт снимок каждые POLL_MS, без
// WebSocket/SSE. Начальные данные приходят пропом с сервера (без лишнего
// клиентского запроса на первом рендере).
export function LiveEventsFeed({ initialEvents }: { initialEvents: FeedEvent[] }) {
  const [events, setEvents] = useState(initialEvents);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/dashboard/feed");
      if (!res.ok) throw new Error("bad status");
      const data: { events: FeedEvent[] } = await res.json();
      if (!mountedRef.current) return;
      setEvents(data.events);
      setError(null);
    } catch {
      if (mountedRef.current) setError(t.common.errorGeneric);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const pollId = setInterval(load, POLL_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(pollId);
    };
  }, [load]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <LiveDot />
        <h2 className="m-0 font-night text-base font-bold text-night-text">{t.adminDashboard.liveFeed}</h2>
      </div>
      {error && <p className="m-0 text-xs text-night-danger">{error}</p>}
      {events.length === 0 ? (
        <p className="m-0 text-sm text-admin-muted">{t.adminDashboard.liveFeedEmpty}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {events.map((ev) => {
            const badge = MODERATION_BADGE[ev.moderationStatus];
            return (
              <Link
                key={ev.id}
                href={`/events/${ev.slug}`}
                className="flex flex-col gap-1 rounded-app-sm border-l-4 bg-admin-card2 px-3 py-2 no-underline transition-colors hover:bg-admin-border/60"
                style={{ borderLeftColor: EVENT_FORMAT_COLOR[ev.format] }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-night-text">{ev.title}</span>
                  <StatusBadge label={badge.label} variant={badge.variant} className="shrink-0" />
                </div>
                <span className="truncate text-xs text-admin-muted">
                  {[ev.cityName, ev.schoolName].filter(Boolean).join(" · ")}
                </span>
                <span className="text-[0.7rem] text-admin-disabled">{formatTimeAgo(new Date(ev.createdAt))}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
