"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { invalidateHelperCandidates } from "./draw-helper-candidates";

export function RemoveDrawHelperButton({
  participantId,
  heatId,
  role,
}: {
  participantId: string;
  heatId: string;
  role: "LEADER" | "FOLLOWER";
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function remove() {
    setLoading(true);
    const res = await fetch(`/api/draw-participants/${participantId}`, { method: "DELETE" });
    setLoading(false);
    if (res.ok) {
      invalidateHelperCandidates(heatId, role);
      router.refresh();
    }
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="text-admin-muted hover:text-red-400"
      disabled={loading}
      onClick={remove}
    >
      убрать
    </Button>
  );
}
