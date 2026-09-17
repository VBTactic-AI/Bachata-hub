"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

// Публикация фестиваля — отдельное действие (POST, не PATCH со status,
// CLAUDE.md §45), сервер сам проверяет условие "хотя бы 1 Pass уже создан"
// (publishFestival в festival-service.ts) — здесь только показываем
// понятную ошибку, если условие не выполнено, а не гадаем заранее.
export function FestivalPublishButton({ festivalId }: { festivalId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePublish() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/festivals/${festivalId}/publish`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.message ?? "Не удалось опубликовать фестиваль.");
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <Button type="button" variant="admin" onClick={handlePublish} disabled={pending}>
        {pending ? "Публикация…" : "🚀 Опубликовать фестиваль"}
      </Button>
      {error && <p className="m-0 text-sm text-red-400">{error}</p>}
    </div>
  );
}
