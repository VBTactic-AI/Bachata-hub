"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormRoot, Label, Select } from "@/components/ui/field";

type Division = { id: string; name: string };

export function RegisterSelfForm({
  competitionId,
  divisions,
  suggestedRole,
}: {
  competitionId: string;
  divisions: Division[];
  // Подсказка по полу из профиля — участник может выбрать другую роль, тогда
  // потребуется подтверждение организатора (docs/00_DECISIONS.md).
  suggestedRole?: "LEADER" | "FOLLOWER" | null;
}) {
  const router = useRouter();
  const [divisionId, setDivisionId] = useState(divisions[0]?.id ?? "");
  const [role, setRole] = useState<"LEADER" | "FOLLOWER">(suggestedRole ?? "LEADER");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"REGISTERED" | "PENDING_ROLE" | null>(null);
  const [loading, setLoading] = useState(false);

  if (done === "PENDING_ROLE") {
    return (
      <p className="hint-text">
        Вы зарегистрированы. Роль «{role === "LEADER" ? "Ведущий" : "Ведомый"}» отличается от подсказки по вашему полу
        — организатор подтвердит её перед check-in.
      </p>
    );
  }
  if (done === "REGISTERED") return <p className="hint-text">Вы зарегистрированы. Ждите check-in в день мероприятия.</p>;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch(`/api/competitions/${competitionId}/registrations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ divisionId, role }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Не удалось зарегистрироваться.");
      return;
    }
    setDone(data.registration?.roleOverrideStatus === "PENDING" ? "PENDING_ROLE" : "REGISTERED");
    router.refresh();
  }

  return (
    <FormRoot onSubmit={onSubmit} className="max-w-[420px]">
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
      {suggestedRole && role !== suggestedRole && (
        <p className="hint-text">Эта роль отличается от подсказки по вашему полу — потребуется подтверждение организатора.</p>
      )}
      {error && <p className="error-text">{error}</p>}
      <Button type="submit" size="sm" disabled={loading || !divisionId}>
        Зарегистрироваться
      </Button>
    </FormRoot>
  );
}
