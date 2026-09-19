"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/admin/ConfirmModal";

// Настоящее физическое удаление — только для черновика без bridge-Event
// (deleteFestivalDraft, festival-service.ts, CLAUDE.md §18) — сервер сам
// откажет, если у фестиваля уже есть хоть один Pass, здесь показывается
// только когда кнопка вообще имеет смысл (вызывающая страница решает это).
export function FestivalDeleteButton({ festivalId, name }: { festivalId: string; name: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/festivals/${festivalId}`, { method: "DELETE" });
      if (!res.ok) {
        setError("Не удалось удалить черновик. Попробуйте ещё раз.");
        return;
      }
      router.push("/admin/festival");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="adminOutline"
        className="border-red-400/40 text-red-400 hover:border-red-400"
        onClick={() => setConfirming(true)}
        disabled={pending}
      >
        Удалить черновик
      </Button>
      {confirming && (
        <ConfirmModal
          title="Удалить черновик?"
          message={`Черновик фестиваля «${name}» будет удалён без возможности восстановления — это необратимо.${error ? `\n\n${error}` : ""}`}
          confirmLabel={pending ? "Удаление…" : "Удалить"}
          danger
          pending={pending}
          onConfirm={handleDelete}
          onClose={() => setConfirming(false)}
        />
      )}
    </>
  );
}
