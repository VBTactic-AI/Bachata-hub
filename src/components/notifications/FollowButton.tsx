"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export type FollowSubscriptionType = "EVENT" | "SCHOOL" | "CITY" | "COUNTRY" | "EVENT_TYPE" | "INSTRUCTOR";

// Notification & Subscription Engine — Follow-кнопка (Phase 8, ТЗ §35).
// Настоящий optimistic UI: состояние переключается ДО ответа сервера, а не
// после — пользователь не видит "Saving...". При ошибке — откат + короткое
// сообщение, без падения интерфейса.
export function FollowButton({
  type,
  targetId,
  loggedIn,
  initialSubscriptionId,
  labelFollow = "Подписаться",
  labelFollowing = "Подписан",
  className,
}: {
  type: FollowSubscriptionType;
  targetId: string;
  loggedIn: boolean;
  initialSubscriptionId: string | null;
  labelFollow?: string;
  labelFollowing?: string;
  className?: string;
}) {
  const [subscriptionId, setSubscriptionId] = useState(initialSubscriptionId);
  const [error, setError] = useState<string | null>(null);
  const following = subscriptionId !== null;

  if (!loggedIn) {
    return (
      <a href="/login" className="text-sm text-night-primary no-underline hover:underline">
        Войдите, чтобы подписаться
      </a>
    );
  }

  async function toggle() {
    setError(null);
    if (following) {
      const idToRemove = subscriptionId!;
      setSubscriptionId(null);
      const res = await fetch(`/api/subscriptions/${idToRemove}`, { method: "DELETE" });
      if (!res.ok) {
        setSubscriptionId(idToRemove);
        setError("Не удалось отписаться, попробуйте ещё раз.");
      }
    } else {
      const placeholder = "pending";
      setSubscriptionId(placeholder);
      const res = await fetch("/api/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, targetId }),
      });
      if (res.ok) {
        const data = await res.json();
        setSubscriptionId(data.subscription.id as string);
      } else {
        setSubscriptionId(null);
        setError("Не удалось подписаться, попробуйте ещё раз.");
      }
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        type="button"
        size="sm"
        onClick={toggle}
        className={
          className ??
          (following
            ? "border border-night-border bg-transparent text-night-text hover:border-red-400/60 hover:text-red-400"
            : "border-none bg-gradient-night-cta")
        }
      >
        {following ? `✓ ${labelFollowing}` : labelFollow}
      </Button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}
