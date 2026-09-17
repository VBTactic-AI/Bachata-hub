"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

// Настоящее физическое удаление — только для черновика без bridge-Event
// (deleteFestivalDraft, festival-service.ts, CLAUDE.md §18) — сервер сам
// откажет, если у фестиваля уже есть хоть один Pass, здесь показывается
// только когда кнопка вообще имеет смысл (вызывающая страница решает это).
export function FestivalDeleteButton({ festivalId, name }: { festivalId: string; name: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleDelete() {
    if (!window.confirm(`Удалить черновик фестиваля «${name}»?\n\nЭто необратимо — черновик без единого Pass можно удалить полностью.`)) {
      return;
    }
    setPending(true);
    try {
      const res = await fetch(`/api/festivals/${festivalId}`, { method: "DELETE" });
      if (!res.ok) {
        window.alert("Не удалось удалить черновик. Попробуйте ещё раз.");
        return;
      }
      router.push("/admin/festival");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <Button type="button" variant="adminOutline" className="border-red-400/40 text-red-400 hover:border-red-400" onClick={handleDelete} disabled={pending}>
      {pending ? "Удаление…" : "Удалить черновик"}
    </Button>
  );
}
