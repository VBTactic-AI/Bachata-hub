"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TrashIcon } from "@/components/admin/icons";
import { cn } from "@/lib/cn";

// "Удалить" в табличке "Мои события" — физического удаления Event в
// проекте нет и не заводится (CLAUDE.md §18/§27, история конкурса/модерации
// не должна теряться молча) — переиспользует уже существующий
// POST /api/event-drafts/[id]/cancel (cancelEvent(), терминальный переход
// в ARCHIVED, был реализован ранее, но раньше не имел ни одной кнопки в UI).
export function EventDeleteButton({ eventId, title, className }: { eventId: string; title: string; className?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    if (!window.confirm(`Удалить событие «${title || "Без названия"}»?\n\nОно уйдёт в архив — историю и статистику можно будет восстановить у администратора, полностью данные не стираются.`)) {
      return;
    }
    setPending(true);
    try {
      const res = await fetch(`/api/event-drafts/${eventId}/cancel`, { method: "POST" });
      if (!res.ok) {
        window.alert("Не удалось удалить событие. Попробуйте ещё раз.");
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={handleDelete}
      title="Удалить"
      aria-label="Удалить событие"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-app-sm p-1.5 text-admin-muted transition-colors hover:bg-red-400/10 hover:text-red-400 disabled:opacity-50",
        className
      )}
    >
      <TrashIcon />
    </button>
  );
}
