"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function FestivalArchiveButton({ festivalId, name }: { festivalId: string; name: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleArchive() {
    if (!window.confirm(`Снять фестиваль «${name}» с публикации?\n\nОн перестанет быть виден на сайте — вернуть можно будет только вручную через администратора.`)) {
      return;
    }
    setPending(true);
    try {
      const res = await fetch(`/api/festivals/${festivalId}/archive`, { method: "POST" });
      if (!res.ok) {
        window.alert("Не удалось архивировать фестиваль. Попробуйте ещё раз.");
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <Button type="button" variant="adminOutline" onClick={handleArchive} disabled={pending}>
      {pending ? "Архивация…" : "Архивировать"}
    </Button>
  );
}
