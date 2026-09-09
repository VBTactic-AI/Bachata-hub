"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { fetchHelperCandidates, invalidateHelperCandidates, type HelperCandidateGroup } from "./draw-helper-candidates";

export function ReplaceDrawHelperButton({
  heatId,
  participantId,
  role,
}: {
  heatId: string;
  participantId: string;
  role: "LEADER" | "FOLLOWER";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState<HelperCandidateGroup[]>([]);
  const [registrationId, setRegistrationId] = useState("");
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
        setRegistrationId(data.suggestedRegistrationId ?? data.divisions[0]?.registrations[0]?.id ?? "");
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Не удалось загрузить список кандидатов.");
        setGroups([]);
      })
      .finally(() => setLoadingCandidates(false));
  }, [open, role, heatId]);

  async function submit() {
    if (!registrationId) return;
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/draw-participants/${participantId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ registrationId }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось заменить помощника.");
      return;
    }
    invalidateHelperCandidates(heatId, role);
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="text-admin-muted hover:text-admin-primaryHover"
        onClick={() => setOpen(true)}
      >
        заменить
      </Button>
    );
  }

  // Раскрытое состояние — свой блок на всю ширину строки (не инлайн рядом с
  // «убрать»): список судьи выбирает из <Select>, который при узкой колонке
  // не помещался в один ряд с кнопками и "скакал" при перестроении (по
  // прямому запросу пользователя, 2026-09-09). Строка выбора — отдельно,
  // строка действий — отдельно, ширина и порядок всегда одни и те же.
  return (
    <div className="flex w-full flex-col gap-1.5 rounded-app-sm border border-admin-border bg-admin-card2 p-2">
      {loadingCandidates ? (
        <span className="text-sm text-admin-muted">Загрузка…</span>
      ) : groups.length === 0 ? (
        <span className="text-sm text-admin-muted">Нет доступных кандидатов.</span>
      ) : (
        <Select
          value={registrationId}
          onChange={(e) => setRegistrationId(e.target.value)}
          className="w-full border-admin-border bg-admin-bg/70 py-1.5 text-sm text-night-text focus:border-admin-primary focus:ring-admin-primary/20"
        >
          {groups.map((g) => (
            <optgroup key={g.divisionId} label={g.isOwnDivision ? `${g.categoryName} (своя категория)` : g.categoryName}>
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
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" variant="admin" disabled={submitting || !registrationId} onClick={submit}>
          Заменить
        </Button>
        <Button type="button" size="sm" variant="ghost" className="text-admin-muted hover:text-admin-primaryHover" onClick={() => setOpen(false)}>
          Отмена
        </Button>
        {error && <span className="text-sm text-red-400">{error}</span>}
      </div>
    </div>
  );
}
