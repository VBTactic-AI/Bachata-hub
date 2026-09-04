"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label, Input, Select } from "@/components/ui/field";

// Судья закреплён на дивизион и РОЛЬ (LEADER/FOLLOWER), не на пол участника
// (docs/00_DECISIONS.md, уточнение A6, 2026-09-04).
export function AssignJudgeForm({ divisionId }: { divisionId: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"LEADER" | "FOLLOWER">("LEADER");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/divisions/${divisionId}/judges`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ judgeEmail: email, role }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось назначить судью.");
      return;
    }
    setEmail("");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
      <Label>
        Email судьи
        <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="judge@example.com" />
      </Label>
      <Label>
        Кого судит
        <Select value={role} onChange={(e) => setRole(e.target.value as "LEADER" | "FOLLOWER")}>
          <option value="LEADER">Ведущих</option>
          <option value="FOLLOWER">Ведомых</option>
        </Select>
      </Label>
      <Button type="submit" size="sm" variant="outline" disabled={loading}>
        + Судья
      </Button>
      {error && <span className="error-text">{error}</span>}
    </form>
  );
}
