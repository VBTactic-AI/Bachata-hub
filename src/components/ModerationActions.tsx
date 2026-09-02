"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { t } from "@/lib/i18n/dictionary";

export function ModerationActions({ endpoint }: { endpoint: string }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  async function act(action: "approve" | "reject") {
    setLoading(true);
    await fetch(endpoint, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, reason: reason || undefined }),
    });
    setLoading(false);
    router.refresh();
  }

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
      <input
        placeholder={t.moderation.reasonPlaceholder}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        style={{ maxWidth: 220 }}
      />
      <button className="btn btn-sm" type="button" disabled={loading} onClick={() => act("approve")}>
        {t.moderation.approve}
      </button>
      <button
        className="btn btn-secondary btn-sm"
        type="button"
        disabled={loading}
        onClick={() => act("reject")}
      >
        {t.moderation.reject}
      </button>
    </div>
  );
}
