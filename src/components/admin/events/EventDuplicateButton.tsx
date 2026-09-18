"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CopyIcon } from "@/components/admin/icons";
import { cn } from "@/lib/cn";

// "Дублировать" в табличке "Мои события" (2026-09-18, по прямому запросу
// пользователя) — POST на /api/event-drafts/[id]/duplicate (см.
// duplicateEvent() в event-service.ts), затем сразу открывает мастер
// редактирования новой копии (она всегда DRAFT — организатор поправляет
// дату/название перед публикацией, не публикуется сама).
export function EventDuplicateButton({ eventId, title, className }: { eventId: string; title: string; className?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleDuplicate() {
    setPending(true);
    try {
      const res = await fetch(`/api/event-drafts/${eventId}/duplicate`, { method: "POST" });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        window.alert(body?.message || "Не удалось дублировать событие. Попробуйте ещё раз.");
        return;
      }
      router.push(`/admin/content/edit/${body.event.id}`);
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={handleDuplicate}
      title={`Дублировать «${title || "Без названия"}»`}
      aria-label="Дублировать событие"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-app-sm p-1.5 text-admin-muted transition-colors hover:bg-admin-card2 hover:text-night-text disabled:opacity-50",
        className
      )}
    >
      <CopyIcon />
    </button>
  );
}
