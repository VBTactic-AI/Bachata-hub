"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function RemoveDrawHelperButton({ participantId }: { participantId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function remove() {
    setLoading(true);
    const res = await fetch(`/api/draw-participants/${participantId}`, { method: "DELETE" });
    setLoading(false);
    if (res.ok) router.refresh();
  }

  return (
    <Button type="button" size="sm" variant="ghost" disabled={loading} onClick={remove}>
      убрать
    </Button>
  );
}
