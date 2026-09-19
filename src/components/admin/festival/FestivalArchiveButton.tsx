"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/admin/ConfirmModal";

export function FestivalArchiveButton({ festivalId, name }: { festivalId: string; name: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleArchive() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/festivals/${festivalId}/archive`, { method: "POST" });
      if (!res.ok) {
        setError("Не удалось архивировать фестиваль. Попробуйте ещё раз.");
        return;
      }
      setConfirming(false);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button type="button" variant="adminOutline" onClick={() => setConfirming(true)} disabled={pending}>
        Архивировать
      </Button>
      {confirming && (
        <ConfirmModal
          title="Снять с публикации?"
          message={`Фестиваль «${name}» перестанет быть виден на сайте — вернуть можно будет только вручную через администратора.${error ? `\n\n${error}` : ""}`}
          confirmLabel={pending ? "Архивация…" : "Архивировать"}
          danger
          pending={pending}
          onConfirm={handleArchive}
          onClose={() => setConfirming(false)}
        />
      )}
    </>
  );
}
