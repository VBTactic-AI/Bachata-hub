"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

// Отзыв ранее выданного доступа ("на всякий случай", прямой запрос
// пользователя) — отдельная кнопка от ModerationRowActions: применима
// только к уже APPROVED заявке, семантически другое действие (не
// approve/reject), причина обязательна (в отличие от reason у approve/reject).
export function RevokeAccessButton({ endpoint }: { endpoint: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={() => setOpen(true)}
        className="border-admin-border bg-transparent text-red-400 hover:bg-admin-card2"
      >
        Отозвать
      </Button>
    );
  }

  async function submit() {
    if (!reason.trim()) {
      setError("Укажите причину отзыва.");
      return;
    }
    setLoading(true);
    setError(null);
    const res = await fetch(endpoint, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "revoke", reason }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Не удалось отозвать доступ.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Input
        placeholder="Причина отзыва"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="!w-auto max-w-[200px] border-admin-border bg-admin-card2 py-1.5 text-sm text-night-text placeholder:text-admin-disabled focus:border-admin-primary focus:ring-admin-primary/20"
      />
      <Button type="button" size="sm" disabled={loading} onClick={submit} className="border-none bg-red-500/80 text-night-text hover:bg-red-500">
        Подтвердить
      </Button>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={loading}
        onClick={() => setOpen(false)}
        className="border-admin-border bg-transparent text-night-text hover:bg-admin-card2"
      >
        Отмена
      </Button>
      {error && <span className="w-full text-right text-xs text-red-400">{error}</span>}
    </div>
  );
}
