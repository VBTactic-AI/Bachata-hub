"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { t } from "@/lib/i18n/dictionary";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

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
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <Input
        placeholder={t.moderation.reasonPlaceholder}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="max-w-[220px]"
      />
      <Button size="sm" type="button" disabled={loading} onClick={() => act("approve")}>
        {t.moderation.approve}
      </Button>
      <Button variant="secondary" size="sm" type="button" disabled={loading} onClick={() => act("reject")}>
        {t.moderation.reject}
      </Button>
    </div>
  );
}
