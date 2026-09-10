"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { invalidateRealCandidates } from "./draw-real-candidates";

// Убрать РЕАЛЬНОГО участника из захода (режим редактирования, 2026-09-10) —
// DELETE /api/draw-participants/[id] сам определяет по записи (helperSource),
// что это не помощник, и вызывает removeRealParticipant вместо
// removeDrawHelper (draw-manual.ts) — с точки зрения этой кнопки эндпоинт
// тот же, что и у RemoveDrawHelperButton.
export function RemoveRealParticipantButton({ participantId, heatId, role }: { participantId: string; heatId: string; role: "LEADER" | "FOLLOWER" }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function remove() {
    setLoading(true);
    const res = await fetch(`/api/draw-participants/${participantId}`, { method: "DELETE" });
    setLoading(false);
    if (res.ok) {
      invalidateRealCandidates(heatId, role);
      router.refresh();
    }
  }

  return (
    <Button type="button" size="sm" variant="ghost" className="text-admin-muted hover:text-red-400" disabled={loading} onClick={remove}>
      убрать
    </Button>
  );
}
