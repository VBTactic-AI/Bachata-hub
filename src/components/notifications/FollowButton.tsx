"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { StarIcon } from "@/components/Icon";
import { cn } from "@/lib/cn";

export type FollowSubscriptionType = "EVENT" | "SCHOOL" | "CITY" | "COUNTRY" | "EVENT_TYPE" | "INSTRUCTOR" | "ORGANIZER";

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
  variant = "button",
}: {
  type: FollowSubscriptionType;
  targetId: string;
  loggedIn: boolean;
  initialSubscriptionId: string | null;
  labelFollow?: string;
  labelFollowing?: string;
  className?: string;
  // "icon" — компактная звезда для сеток карточек (/events), где полноразмерная
  // кнопка с текстом перегрузила бы карточку (CLAUDE.md §40 — не только для
  // судейского UI, тот же принцип и для плотных публичных лент).
  variant?: "button" | "icon";
}) {
  const [subscriptionId, setSubscriptionId] = useState(initialSubscriptionId);
  const [error, setError] = useState<string | null>(null);
  const following = subscriptionId !== null;

  if (!loggedIn) {
    if (variant === "icon") return null; // звезда молча не показывается гостю — нет места под текст-приглашение в карточке
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

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-label={following ? `${labelFollowing}: ${labelFollow}` : labelFollow}
        aria-pressed={following}
        title={error ?? (following ? labelFollowing : labelFollow)}
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-full border border-night-border bg-black/45 text-white backdrop-blur-sm transition hover:border-night-primary",
          following && "text-night-primary",
          className
        )}
      >
        <StarIcon size={15} filled={following} />
      </button>
    );
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
