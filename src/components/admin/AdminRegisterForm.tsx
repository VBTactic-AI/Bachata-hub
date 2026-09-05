"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormRoot, Input, Label, Select } from "@/components/ui/field";
import { DancerSearchBox } from "./DancerSearchBox";
import { perfFetch } from "@/lib/performance-debug/client";

type Division = { id: string; name: string };

export function AdminRegisterForm({ competitionId, divisions }: { competitionId: string; divisions: Division[] }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [foundExisting, setFoundExisting] = useState(false);
  const [divisionId, setDivisionId] = useState(divisions[0]?.id ?? "");
  const [role, setRole] = useState<"LEADER" | "FOLLOWER">("LEADER");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const clickStartedAt = performance.now();
    setError(null);
    setLoading(true);
    const res = await perfFetch(
      "admin.register_competitor",
      `/api/competitions/${competitionId}/registrations`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ divisionId, role, email, displayName: displayName || undefined }),
      },
      clickStartedAt
    );
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось добавить участника.");
      return;
    }
    setEmail("");
    setDisplayName("");
    setFoundExisting(false);
    router.refresh();
  }

  return (
    <div className="stack gap-3">
      <DancerSearchBox
        competitionId={competitionId}
        onSelect={(d) => {
          setEmail(d.email);
          setDisplayName(d.displayName);
          setFoundExisting(true);
        }}
      />

      <FormRoot onSubmit={onSubmit} className="max-w-[420px]">
        <Label>
          Email участника
          <Input
            type="email"
            required
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setFoundExisting(false);
            }}
          />
        </Label>
        {foundExisting ? (
          <p className="hint-text">
            Найден существующий аккаунт «{displayName}» — регистрация привяжется к нему, новый создаваться не будет.
          </p>
        ) : (
          <Label>
            Имя (если у участника ещё нет аккаунта)
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Необязательно" />
          </Label>
        )}
        <Label>
          Дивизион
          <Select value={divisionId} onChange={(e) => setDivisionId(e.target.value)}>
            {divisions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Label>
        <Label>
          Роль
          <Select value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
            <option value="LEADER">Ведущий (Leader)</option>
            <option value="FOLLOWER">Ведомый (Follower)</option>
          </Select>
        </Label>
        {error && <p className="error-text">{error}</p>}
        <Button type="submit" size="sm" disabled={loading || !divisionId}>
          Добавить участника
        </Button>
      </FormRoot>
    </div>
  );
}
