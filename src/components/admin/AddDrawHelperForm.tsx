"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { REGISTRATION_ROLE_LABELS as ROLE_LABELS } from "@/lib/competition-labels";
import { fetchHelperCandidates, invalidateHelperCandidates, type HelperCandidateGroup } from "./draw-helper-candidates";

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
  const [groups, setGroups] = useState<HelperCandidateGroup[]>([]);
  const [neededCount, setNeededCount] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoadingCandidates(true);
    setError(null);
    fetchHelperCandidates(heatId, role)
      .then((data) => {
        setGroups(data.divisions);
        setNeededCount(data.neededCount);
        setSelected(data.suggestedRegistrationId ? [data.suggestedRegistrationId] : []);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Не удалось загрузить список кандидатов.");
        setGroups([]);
      })
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
        invalidateHelperCandidates(heatId, role);
        router.refresh();
        return;
      }
    }
    invalidateHelperCandidates(heatId, role);
    setSubmitting(false);
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <Button type="button" size="sm" variant="adminOutline" onClick={() => setOpen(true)}>
        + Помощник ({ROLE_LABELS[role] ?? role})
      </Button>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2.5 rounded-app-sm border border-night-warning/30 bg-night-warning/[0.07] p-3">
      <p className="m-0 text-sm font-semibold text-night-warning">
        Не хватает: {ROLE_LABELS[role] ?? role} — выбрано {selected.length} из {neededCount}
      </p>
      {loadingCandidates ? (
        <p className="m-0 text-sm text-admin-muted">Загрузка…</p>
      ) : groups.length === 0 ? (
        <p className="m-0 text-sm text-admin-muted">Нет доступных кандидатов.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {groups.map((g) => (
            <div key={g.divisionId} className="flex flex-col gap-1">
              <p className="m-0 text-[10.5px] font-bold uppercase tracking-wider text-admin-disabled">
                {g.isOwnDivision ? `${g.categoryName} (своя категория)` : g.categoryName}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {g.registrations.map((r) => {
                  const checked = selected.includes(r.id);
                  const disabled = !checked && selected.length >= neededCount;
                  return (
                    <label
                      key={r.id}
                      className={`flex items-center gap-2 rounded-app-sm border px-2.5 py-1.5 text-sm ${
                        checked
                          ? "border-admin-primary bg-admin-primary/10 text-night-text"
                          : disabled
                            ? "border-admin-border text-admin-disabled"
                            : "cursor-pointer border-admin-border text-night-text hover:border-admin-primary"
                      }`}
                    >
                      <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggle(r.id)} />
                      {r.displayName}
                      {r.bibNumber ? ` (№${r.bibNumber})` : ""}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="admin" disabled={submitting || selected.length === 0} onClick={submit}>
          Позвать
        </Button>
        <Button type="button" size="sm" variant="ghost" className="text-admin-muted hover:text-admin-primaryHover" onClick={() => setOpen(false)}>
          Отмена
        </Button>
        {error && <span className="text-sm text-red-400">{error}</span>}
      </div>
      {/* Помощника никто не оценивает — организатор должен это видеть в
          момент вызова, а не узнавать из бейджа постфактум. */}
      <p className="m-0 text-[11.5px] text-admin-disabled">Помощник танцует, но его не оценивают — на результат захода он не влияет.</p>
    </div>
  );
}
