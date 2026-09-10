"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { REGISTRATION_ROLE_LABELS_GENITIVE_PLURAL } from "@/lib/competition-labels";
import { fetchRealCandidates, invalidateRealCandidates, type RealCandidate } from "./draw-real-candidates";

// Режим редактирования (промт пользователя, 2026-09-10) — добавить в заход
// РЕАЛЬНОГО участника (не помощника): своей же категории, ещё не вызванного
// ни в один заход этого раунда. В отличие от AddDrawHelperForm — один
// список без группировки по категориям (кандидаты всегда только из своей
// категории, addRealParticipant/draw-manual.ts это и проверяет на сервере),
// и лимит выбора — не "сколько не хватает", а "сколько ещё влезает по
// вместимости" (remainingSlots).
export function AddRealParticipantForm({
  heatId,
  role,
  categoryName,
  roundName,
  heatNumber,
}: {
  heatId: string;
  role: "LEADER" | "FOLLOWER";
  categoryName: string;
  roundName: string;
  heatNumber: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [candidates, setCandidates] = useState<RealCandidate[]>([]);
  const [remainingSlots, setRemainingSlots] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoadingCandidates(true);
    setError(null);
    fetchRealCandidates(heatId, role)
      .then((data) => {
        setCandidates(data.registrations);
        setRemainingSlots(data.remainingSlots);
        setSelected([]);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Не удалось загрузить список кандидатов.");
        setCandidates([]);
      })
      .finally(() => setLoadingCandidates(false));
  }, [open, role, heatId]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function toggle(id: string) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= remainingSlots) return prev;
      return [...prev, id];
    });
  }

  async function submit() {
    if (selected.length === 0) return;
    setSubmitting(true);
    setError(null);
    for (const registrationId of selected) {
      const res = await fetch(`/api/heats/${heatId}/real-participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId, role }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSubmitting(false);
        setError(data.error || "Не удалось добавить участника.");
        invalidateRealCandidates(heatId, role);
        router.refresh();
        return;
      }
    }
    invalidateRealCandidates(heatId, role);
    setSubmitting(false);
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      {/* Кнопка всегда кликабельна (как и "+ Помощник", AddDrawHelperForm) —
          сколько реально осталось мест, известно только после загрузки
          кандидатов В МОДАЛКЕ; заранее дизейблить её нечем (найдено вживую,
          2026-09-10: remainingSlots до первого открытия всегда 0 по
          умолчанию, кнопка была бы вечно недоступна). Пустой случай ("заход
          уже заполнен") показывается уже внутри модалки. */}
      <Button type="button" size="sm" variant="adminOutline" onClick={() => setOpen(true)}>
        + {role === "LEADER" ? "Партнёра" : "Партнёршу"}
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5" onClick={() => setOpen(false)} role="presentation">
          <div
            className="flex max-h-[88vh] w-full max-w-[480px] flex-col overflow-hidden rounded-app border border-admin-border bg-admin-card shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-real-participant-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-admin-border px-5 py-4">
              <h3 id="add-real-participant-title" className="m-0 text-[17px] font-extrabold text-night-text">
                Добавить {role === "LEADER" ? "партнёра" : "партнёршу"} в заход
              </h3>
              <p className="m-0 mt-1.5 text-[12.5px] text-admin-muted">
                {categoryName} · {roundName} · Заход {heatNumber} — из тех, кто ещё не вызван ни в один заход этого раунда.
              </p>
              {!loadingCandidates && (
                <span className="mt-2.5 inline-flex items-center gap-2 rounded-full border border-admin-border bg-admin-card2 px-3 py-1.5 text-xs font-bold text-admin-muted">
                  Выбрано {selected.length} из {remainingSlots} свободных мест
                </span>
              )}
            </div>

            <div className="flex-1 overflow-y-auto py-1.5">
              {loadingCandidates ? (
                <p className="m-0 px-5 py-4 text-sm text-admin-muted">Загрузка…</p>
              ) : remainingSlots === 0 ? (
                <p className="m-0 px-5 py-4 text-sm text-admin-muted">
                  Заход уже заполнен по этой роли (вместимость исчерпана).
                </p>
              ) : candidates.length === 0 ? (
                <p className="m-0 px-5 py-4 text-sm text-admin-muted">
                  Все {REGISTRATION_ROLE_LABELS_GENITIVE_PLURAL[role] ?? role} категории «{categoryName}» уже участвуют в
                  каком-то заходе этого раунда. Если сторон не хватает — используйте «+ Помощник».
                </p>
              ) : (
                candidates.map((r) => {
                  const checked = selected.includes(r.id);
                  const disabled = !checked && selected.length >= remainingSlots;
                  return (
                    <label
                      key={r.id}
                      className={`flex items-center gap-3 px-5 py-2 ${disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer hover:bg-admin-card2"}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        onChange={() => toggle(r.id)}
                        className="h-[18px] w-[18px] shrink-0 accent-admin-primary"
                      />
                      <span className="min-w-[42px] shrink-0 text-xs font-bold tabular-nums text-admin-muted">
                        {r.bibNumber ? `№${r.bibNumber}` : "—"}
                      </span>
                      <span className="truncate text-sm font-semibold text-night-text">{r.displayName}</span>
                    </label>
                  );
                })
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-admin-border px-5 py-4">
              <p className="m-0 max-w-[230px] text-[11.5px] leading-snug text-admin-disabled">
                Реальный участник — оценивается и влияет на результат, в отличие от помощника.
              </p>
              <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                {error && <span className="text-xs text-red-400">{error}</span>}
                <Button type="button" size="sm" variant="ghost" className="text-admin-muted hover:text-admin-primaryHover" onClick={() => setOpen(false)}>
                  Отмена
                </Button>
                <Button type="button" size="sm" variant="admin" disabled={submitting || selected.length === 0} onClick={submit}>
                  Добавить
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
