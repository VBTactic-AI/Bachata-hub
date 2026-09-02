"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { t } from "@/lib/i18n/dictionary";

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
    <button
      className={isBlocked ? "btn btn-sm" : "btn btn-secondary btn-sm"}
      type="button"
      disabled={loading}
      onClick={toggle}
    >
      {isBlocked ? t.moderation.unblockUser : t.moderation.blockUser}
    </button>
  );
}
