"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type Tier = {
  source: "GUEST_HIGHER_CATEGORY" | "SAME_CATEGORY_NON_FINALIST" | "OWN_FINAL_OPPOSITE_ROLE";
  label: string;
  registrations: { id: string; displayName: string; bibNumber: string | null }[];
};

// Модалка ручного добора судьи-партнёра для JUDGES_DANCE (CLAUDE.md §64) —
// тот же макет, что и AddDrawHelperForm (тем же промтом пользователя,
// 2026-09-10, подтверждено оставить "на всякий случай" поверх авто-заполнения
// при формировании списка, final-judges-dance.ts), но кандидаты — 3
// фиксированных уровня каскада (категория выше / своя категория без финала /
// финалисты этого же финала, ждущие своей стадии), а не по дивизионам.
export function AddJudgesDanceHelperForm({ heatId, roleLabel }: { heatId: string; roleLabel: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [neededCount, setNeededCount] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoadingCandidates(true);
    setError(null);
    fetch(`/api/heats/${heatId}/judges-dance-helper-candidates`)
      .then((res) => res.json())
      .then((data) => {
        if (!data.ok) throw new Error(data.error || "Не удалось загрузить список кандидатов.");
        setTiers(data.tiers ?? []);
        setNeededCount(data.neededCount ?? 1);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Не удалось загрузить список кандидатов.");
        setTiers([]);
      })
      .finally(() => setLoadingCandidates(false));
  }, [open, heatId]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  async function submit() {
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/heats/${heatId}/judges-dance-helpers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ registrationId: selected }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось добавить помощника.");
      return;
    }
    setOpen(false);
    setSelected(null);
    router.refresh();
  }

  return (
    <>
      <Button type="button" size="sm" variant="adminOutline" className="border-night-warning/50 bg-night-warning/10 text-night-warning hover:border-night-warning hover:bg-night-warning/15 hover:text-night-warning" onClick={() => setOpen(true)}>
        + Судья на помощь
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5" onClick={() => setOpen(false)} role="presentation">
          <div
            className="flex max-h-[88vh] w-full max-w-[520px] flex-col overflow-hidden rounded-app border border-admin-border bg-admin-card shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-judges-dance-helper-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-admin-border px-5 py-4">
              <h3 id="add-judges-dance-helper-title" className="m-0 text-[17px] font-extrabold text-night-text">
                Позвать судью-партнёра на паркет
              </h3>
              <p className="m-0 mt-1.5 text-[12.5px] text-admin-muted">
                Не хватает реальных судей — партнёром для {roleLabel.toLowerCase()} нужен помощник противоположной роли.
              </p>
              <span className="mt-2.5 inline-flex items-center gap-2 rounded-full border border-night-warning/30 bg-night-warning/10 px-3 py-1.5 text-xs font-bold text-night-warning">
                Не хватает: {neededCount}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto py-1.5">
              {loadingCandidates ? (
                <p className="m-0 px-5 py-4 text-sm text-admin-muted">Загрузка…</p>
              ) : tiers.length === 0 ? (
                <p className="m-0 px-5 py-4 text-sm text-admin-muted">Нет доступных кандидатов.</p>
              ) : (
                tiers.map((tier) => (
                  <div key={tier.source}>
                    <p className="m-0 px-5 pb-1 pt-3 text-[10.5px] font-bold uppercase tracking-wider text-admin-disabled">{tier.label}</p>
                    {tier.registrations.map((r) => (
                      <label
                        key={r.id}
                        className="flex cursor-pointer items-center gap-3 px-5 py-2 hover:bg-admin-card2"
                      >
                        <input
                          type="radio"
                          name="judges-dance-helper"
                          checked={selected === r.id}
                          onChange={() => setSelected(r.id)}
                          className="h-[18px] w-[18px] shrink-0 accent-admin-primary"
                        />
                        <span className="min-w-[42px] shrink-0 text-xs font-bold tabular-nums text-admin-muted">{r.bibNumber ? `№${r.bibNumber}` : "—"}</span>
                        <span className="truncate text-sm font-semibold text-night-text">{r.displayName}</span>
                      </label>
                    ))}
                  </div>
                ))
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-admin-border px-5 py-4">
              <p className="m-0 max-w-[230px] text-[11.5px] leading-snug text-admin-disabled">
                Помощник танцует, но его не оценивают — на результат финала он не влияет.
              </p>
              <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                {error && <span className="text-xs text-red-400">{error}</span>}
                <Button type="button" size="sm" variant="ghost" className="text-admin-muted hover:text-admin-primaryHover" onClick={() => setOpen(false)}>
                  Отмена
                </Button>
                <Button type="button" size="sm" variant="admin" disabled={submitting || !selected} onClick={submit}>
                  Позвать
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
