"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";

// Recurring Events v2 — общая иконка-кнопка для действий над Series/Template
// (Пауза/Возобновить/Дублировать/Архивировать), которые сводятся к "POST на
// эндпоинт, затем обновить страницу" (тот же принцип, что и
// EventDeleteButton.tsx, только не завязан на один конкретный эндпоинт).
export function PostActionButton({
  endpoint,
  icon,
  label,
  confirmText,
  tone = "muted",
  // "icon" — компактная иконка-кнопка (таблицы/карточки, как EventDeleteButton).
  // "full" — иконка + видимый текст label (например, "Опасная зона").
  variant = "icon",
  className,
}: {
  endpoint: string;
  icon: React.ReactNode;
  label: string;
  confirmText?: string;
  tone?: "muted" | "danger";
  variant?: "icon" | "full";
  className?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleClick() {
    if (confirmText && !window.confirm(confirmText)) return;
    setPending(true);
    try {
      const res = await fetch(endpoint, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        window.alert(body?.message || "Не удалось выполнить действие. Попробуйте ещё раз.");
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  if (variant === "full") {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={handleClick}
        className={cn(
          "inline-flex w-full items-center justify-center gap-1.5 rounded-app-sm border px-4 py-1.5 text-sm font-semibold transition-colors disabled:opacity-50",
          tone === "danger" ? "border-admin-border text-red-400 hover:bg-red-400/10" : "border-admin-border text-night-text hover:bg-admin-card2",
          className
        )}
      >
        {icon}
        {pending ? "…" : label}
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={handleClick}
      title={label}
      aria-label={label}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-app-sm p-1.5 transition-colors disabled:opacity-50",
        tone === "danger" ? "text-admin-muted hover:bg-red-400/10 hover:text-red-400" : "text-admin-muted hover:bg-admin-card2 hover:text-night-text",
        className
      )}
    >
      {icon}
    </button>
  );
}
