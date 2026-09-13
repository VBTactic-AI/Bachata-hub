"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type NotificationItem = {
  id: string;
  type: string;
  priority: "INFO" | "IMPORTANT" | "URGENT";
  title: string;
  body: string;
  deepLink: string | null;
  isRead: boolean;
  createdAt: string;
};

const PRIORITY_DOT: Record<NotificationItem["priority"], string> = {
  INFO: "bg-night-muted",
  IMPORTANT: "bg-night-pink",
  URGENT: "bg-red-400",
};

// Notification & Subscription Engine — колокольчик (Phase 8, ТЗ §9).
// Опрос unread-count раз в 30 сек — тот же паттерн, что уже используется в
// проекте для низкочастотных живых данных (админ-лента, ротация), не
// Supabase Realtime: полноценный realtime для персональных уведомлений —
// отдельное расширение поверх уже рабочего backend, не блокирует MVP.
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationItem[] | null>(null);
  const [loading, setLoading] = useState(false);

  const pollUnreadCount = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/unread-count");
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.count as number);
      }
    } catch {
      // Тихо игнорируем сбой опроса — колокольчик не должен ронять страницу
      // из-за временной сетевой проблемы, следующий тик поправит счётчик.
    }
  }, []);

  useEffect(() => {
    pollUnreadCount();
    const interval = setInterval(pollUnreadCount, 30_000);
    return () => clearInterval(interval);
  }, [pollUnreadCount]);

  async function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next) {
      setLoading(true);
      try {
        const res = await fetch("/api/notifications?limit=10");
        if (res.ok) {
          const data = await res.json();
          setNotifications(data.notifications as NotificationItem[]);
        }
      } finally {
        setLoading(false);
      }
    }
  }

  async function markRead(id: string) {
    setNotifications((prev) => prev?.map((n) => (n.id === id ? { ...n, isRead: true } : n)) ?? null);
    setUnreadCount((c) => Math.max(0, c - 1));
    await fetch(`/api/notifications/${id}/read`, { method: "POST" }).catch(() => {});
  }

  async function markAllRead() {
    setNotifications((prev) => prev?.map((n) => ({ ...n, isRead: true })) ?? null);
    setUnreadCount(0);
    await fetch("/api/notifications/read-all", { method: "POST" }).catch(() => {});
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggleOpen}
        aria-label="Уведомления"
        className="relative flex h-9 w-9 items-center justify-center rounded-full border border-night-border bg-transparent text-lg text-night-text hover:border-night-primary"
      >
        🔔
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-night-primary px-1 text-[0.65rem] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Клик вне дропдауна закрывает его */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-2 w-80 rounded-app border border-night-border bg-night-card shadow-lg">
            <div className="flex items-center justify-between border-b border-night-border px-4 py-2.5">
              <strong className="font-night text-sm text-night-text">Уведомления</strong>
              <button type="button" onClick={markAllRead} className="border-none bg-transparent text-xs text-night-primary">
                Прочитать все
              </button>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {loading && <p className="p-4 text-sm text-night-muted">Загрузка…</p>}
              {!loading && notifications?.length === 0 && (
                <p className="p-4 text-sm text-night-muted">Пока нет уведомлений</p>
              )}
              {notifications?.map((n) => (
                <Link
                  key={n.id}
                  href={n.deepLink ?? "/notifications"}
                  onClick={() => {
                    if (!n.isRead) markRead(n.id);
                    setOpen(false);
                  }}
                  className={`flex gap-2 border-b border-night-border px-4 py-2.5 no-underline last:border-0 hover:bg-night-card2 hover:no-underline ${
                    n.isRead ? "" : "bg-night-primary/5"
                  }`}
                >
                  <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${PRIORITY_DOT[n.priority]}`} />
                  <span className="flex flex-col">
                    <span className="text-sm font-semibold text-night-text">{n.title}</span>
                    <span className="mt-0.5 text-xs text-night-muted">{n.body}</span>
                  </span>
                </Link>
              ))}
            </div>
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="block rounded-b-app border-t border-night-border px-4 py-2.5 text-center text-sm text-night-primary no-underline hover:no-underline"
            >
              Все уведомления
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
