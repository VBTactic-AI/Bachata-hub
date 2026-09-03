"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function ToggleRoundStageActiveButton({ stageId, isActive }: { stageId: string; isActive: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function toggle() {
    setLoading(true);
    await fetch(`/api/round-stages/${stageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !isActive }),
    });
    setLoading(false);
    router.refresh();
  }

  return (
    <Button variant="secondary" size="sm" type="button" disabled={loading} onClick={toggle}>
      {isActive ? "Скрыть" : "Вернуть в список"}
    </Button>
  );
}
