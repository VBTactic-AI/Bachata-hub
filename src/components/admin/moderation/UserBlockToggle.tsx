"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { t } from "@/lib/i18n/dictionary";
import { Button } from "@/components/ui/button";

// Admin-тёмная версия старого src/components/UserBlockToggle.tsx (жил на
// светлой /moderation/users) — та же логика, только вёрстка под admin-*
// (2026-09-11).
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
      type="button"
      size="sm"
      variant={isBlocked ? "admin" : "secondary"}
      disabled={loading}
      onClick={toggle}
      className={isBlocked ? "border-none bg-gradient-admin-cta" : "border-admin-border bg-transparent text-night-text hover:bg-admin-card2"}
    >
      {isBlocked ? t.moderation.unblockUser : t.moderation.blockUser}
    </Button>
  );
}
