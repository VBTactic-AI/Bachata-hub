"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { t } from "@/lib/i18n/dictionary";
import { Button } from "@/components/ui/button";

export function UserBlockToggle({ userId, isBlocked }: { userId: string; isBlocked: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function toggle() {
    const action = isBlocked ? "unblock" : "block";
    if (action === "block" && !window.confirm(t.moderation.blockUserConfirm)) return;
    setLoading(true);
    await fetch(`/api/moderation/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setLoading(false);
    router.refresh();
  }

  return (
    <Button
      variant={isBlocked ? "default" : "secondary"}
      size="sm"
      type="button"
      disabled={loading}
      onClick={toggle}
    >
      {isBlocked ? t.moderation.unblockUser : t.moderation.blockUser}
    </Button>
  );
}
