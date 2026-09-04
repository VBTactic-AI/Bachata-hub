"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { REGISTRATION_ROLE_LABELS as ROLE_LABELS } from "@/lib/competition-labels";

type Candidate = { id: string; displayName: string; bibNumber: string | null };
type CandidateGroup = {
  divisionId: string;
  categoryName: string;
  categoryOrder: number;
  isOwnDivision: boolean;
  registrations: Candidate[];
};

// Роль всегда та, которой реально не хватает в заезде (родитель считает это
// по факту текущего списка и не рендерит форму вовсе, если сторон уже
// поровну — docs/00_DECISIONS.md, 2026-09-04) — выбора роли тут нет.
//
// Список кандидатов уже не показывает тех, кто в заходе есть (ни реальных,
// ни уже позванных помощников) — сервер их сам исключает, и группы с 0
// кандидатов после этого просто не приходят, поэтому "каскад" к следующей
// группе не требует отдельного действия. Можно выбрать сразу нескольких, но
// не больше, чем реально не хватает (neededCount) — по запросу пользователя,
// 2026-09-04.
export function AddDrawHelperForm({ heatId, role }: { heatId: string; role: "LEADER" | "FOLLOWER" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState<CandidateGroup[]>([]);
  const [neededCount, setNeededCount] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
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
        setNeededCount(data.neededCount ?? 1);
        setSelected(data.suggestedRegistrationId ? [data.suggestedRegistrationId] : []);
      })
      .catch(() => setError("Не удалось загрузить список кандидатов."))
      .finally(() => setLoadingCandidates(false));
  }, [open, role, heatId]);

  function toggle(id: string) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= neededCount) return prev; // больше, чем реально не хватает, не даём выбрать
      return [...prev, id];
    });
  }

  async function submit() {
    if (selected.length === 0) return;
    setSubmitting(true);
    setError(null);
    for (const registrationId of selected) {
      const res = await fetch(`/api/heats/${heatId}/helpers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId, role }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSubmitting(false);
        setError(data.error || "Не удалось добавить помощника.");
        router.refresh();
        return;
      }
    }
    setSubmitting(false);
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        + Помощник ({ROLE_LABELS[role] ?? role})
      </Button>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-start gap-2">
      <span className="hint-text">
        Не хватает: {ROLE_LABELS[role] ?? role} — выбрано {selected.length} из {neededCount}
      </span>
      {loadingCandidates ? (
        <span className="hint-text">Загрузка…</span>
      ) : groups.length === 0 ? (
        <span className="hint-text">Нет доступных кандидатов.</span>
      ) : (
        <span className="stack gap-1.5">
          {groups.map((g) => (
            <span key={g.divisionId} className="stack gap-0.5">
              <span className="hint-text">{g.isOwnDivision ? `${g.categoryName} (свой дивизион)` : g.categoryName}</span>
              {g.registrations.map((r) => {
                const checked = selected.includes(r.id);
                const disabled = !checked && selected.length >= neededCount;
                return (
                  <label key={r.id} className="flex items-center gap-2">
                    <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggle(r.id)} />
                    {r.displayName}
                    {r.bibNumber ? ` (№${r.bibNumber})` : ""}
                  </label>
                );
              })}
            </span>
          ))}
        </span>
      )}
      <Button type="button" size="sm" disabled={submitting || selected.length === 0} onClick={submit}>
        Позвать
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
        Отмена
      </Button>
      {error && <span className="error-text">{error}</span>}
    </span>
  );
}
