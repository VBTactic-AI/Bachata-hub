"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";

type Candidate = { id: string; displayName: string; bibNumber: string | null };
type CandidateGroup = {
  divisionId: string;
  categoryName: string;
  categoryOrder: number;
  isOwnDivision: boolean;
  registrations: Candidate[];
};

export function AddDrawHelperForm({ heatId }: { heatId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<"LEADER" | "FOLLOWER">("LEADER");
  const [groups, setGroups] = useState<CandidateGroup[]>([]);
  const [registrationId, setRegistrationId] = useState("");
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoadingCandidates(true);
    setError(null);
    fetch(`/api/heats/${heatId}/helpers?role=${role}`)
      .then((res) => res.json())
      .then((data) => {
        if (!data.ok) {
          setError(data.error || "Не удалось загрузить список кандидатов.");
          setGroups([]);
          return;
        }
        setGroups(data.divisions ?? []);
        setRegistrationId(data.suggestedRegistrationId ?? data.divisions?.[0]?.registrations?.[0]?.id ?? "");
      })
      .catch(() => setError("Не удалось загрузить список кандидатов."))
      .finally(() => setLoadingCandidates(false));
  }, [open, role, heatId]);

  async function submit() {
    if (!registrationId) return;
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/heats/${heatId}/helpers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ registrationId, role }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось добавить помощника.");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        + Помощник
      </Button>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Select value={role} onChange={(e) => setRole(e.target.value as typeof role)} className="!w-auto py-1.5 text-sm">
        <option value="LEADER">Ведущий</option>
        <option value="FOLLOWER">Ведомый</option>
      </Select>
      {loadingCandidates ? (
        <span className="hint-text">Загрузка…</span>
      ) : groups.length === 0 ? (
        <span className="hint-text">Нет доступных кандидатов.</span>
      ) : (
        <Select value={registrationId} onChange={(e) => setRegistrationId(e.target.value)} className="!w-auto py-1.5 text-sm">
          {groups.map((g) => (
            <optgroup key={g.divisionId} label={g.isOwnDivision ? `${g.categoryName} (свой дивизион)` : g.categoryName}>
              {g.registrations.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.displayName}
                  {r.bibNumber ? ` (№${r.bibNumber})` : ""}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      )}
      <Button type="button" size="sm" disabled={submitting || !registrationId} onClick={submit}>
        Позвать
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
        Отмена
      </Button>
      {error && <span className="error-text">{error}</span>}
    </span>
  );
}
