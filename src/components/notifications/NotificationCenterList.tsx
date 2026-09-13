"use client";

import { useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

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

const PRIORITY_LABEL: Record<NotificationItem["priority"], string> = {
  INFO: "Инфо",
  IMPORTANT: "Важно",
  URGENT: "Срочно",
};
const PRIORITY_CLASS: Record<NotificationItem["priority"], string> = {
  INFO: "bg-night-card2 text-night-muted",
  IMPORTANT: "bg-night-primary/15 text-night-pink",
  URGENT: "bg-red-400/15 text-red-400",
};

function formatDateTimeRu(iso: string) {
  return new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" });
}

// Notification & Subscription Engine — Notification Center (Phase 8, ТЗ §9):
// read/unread, mark as read, mark all as read, фильтр, пагинация курсором,
// deep link на объект. Бизнес-логика (что считать прочитанным и т.д.) — на
// сервере (notification-center.ts), здесь только UI-состояние и optimistic-
// обновление списка.
export function NotificationCenterList({
  initialNotifications,
  initialCursor,
}: {
  initialNotifications: NotificationItem[];
  initialCursor: string | null;
}) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [cursor, setCursor] = useState(initialCursor);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [switchingFilter, setSwitchingFilter] = useState(false);

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({ cursor, ...(unreadOnly ? { unread: "true" } : {}) });
      const res = await fetch(`/api/notifications?${params}`);
      if (res.ok) {
        const data = await res.json();
        setNotifications((prev) => [...prev, ...data.notifications]);
        setCursor(data.nextCursor);
      }
    } finally {
      setLoadingMore(false);
    }
  }

  async function toggleUnreadOnly(next: boolean) {
    setUnreadOnly(next);
    setSwitchingFilter(true);
    try {
      const params = new URLSearchParams(next ? { unread: "true" } : {});
      const res = await fetch(`/api/notifications?${params}`);
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications);
        setCursor(data.nextCursor);
      }
    } finally {
      setSwitchingFilter(false);
    }
  }

  async function markRead(id: string) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    await fetch(`/api/notifications/${id}/read`, { method: "POST" }).catch(() => {});
  }

  async function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    await fetch("/api/notifications/read-all", { method: "POST" }).catch(() => {});
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => toggleUnreadOnly(false)}
            className={!unreadOnly ? "border-none bg-gradient-night-cta" : "border border-night-border bg-transparent text-night-text"}
          >
            Все
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => toggleUnreadOnly(true)}
            className={unreadOnly ? "border-none bg-gradient-night-cta" : "border border-night-border bg-transparent text-night-text"}
          >
            Непрочитанные
          </Button>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={markAllRead}
          className="text-night-primary hover:text-night-primary"
        >
          Прочитать все
        </Button>
      </div>

      {switchingFilter ? (
        <p className="text-sm text-night-muted">Загрузка…</p>
      ) : notifications.length === 0 ? (
        <p className="text-sm text-night-muted">{unreadOnly ? "Нет непрочитанных уведомлений" : "Пока нет уведомлений"}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {notifications.map((n) => (
            <Card
              key={n.id}
              className={`border-night-border bg-night-card ${n.isRead ? "" : "border-night-primary/40"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[0.7rem] font-bold ${PRIORITY_CLASS[n.priority]}`}>
                      {PRIORITY_LABEL[n.priority]}
                    </span>
                    <span className="text-xs text-night-muted">{formatDateTimeRu(n.createdAt)}</span>
                  </div>
                  <strong className="text-sm text-night-text">{n.title}</strong>
                  <p className="m-0 text-sm text-night-muted">{n.body}</p>
                  {n.deepLink && (
                    <Link
                      href={n.deepLink}
                      onClick={() => !n.isRead && markRead(n.id)}
                      className="text-sm text-night-primary no-underline hover:underline"
                    >
                      Подробнее →
                    </Link>
                  )}
                </div>
                {!n.isRead && (
                  <button
                    type="button"
                    onClick={() => markRead(n.id)}
                    className="shrink-0 border-none bg-transparent text-xs text-night-primary"
                  >
                    Прочитано
                  </button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {cursor && !switchingFilter && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={loadingMore}
          onClick={loadMore}
          className="self-center border-night-border text-night-text"
        >
          {loadingMore ? "Загрузка…" : "Показать ещё"}
        </Button>
      )}
    </div>
  );
}
