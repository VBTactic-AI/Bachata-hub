"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export type AssignableCategory = { id: string; name: string; color: string };

// Попап "Категории судьи" (клик по столбцу "Категории" в общей таблице
// судей, 2026-09-12, по прямому запросу пользователя) — тот же модальный
// паттерн, что и AddDrawHelperForm (fixed-оверлей, Esc закрывает, клик по
// фону закрывает). В отличие от DivisionJudgesPanel (диф по судьям ОДНОЙ
// категории) здесь диф по КАТЕГОРИЯМ одного судьи — реконсиляция целиком на
// сервере (setJudgeCategories), роль в новой категории сервер определяет сам
// (наследует существующую роль судьи либо, если её ещё нет, — по полу; см.
// комментарий в судебном сервисе).
export function AssignJudgeCategoriesModal({
  competitionId,
  judgeUserId,
  judgeName,
  allCategories,
  assignedCategoryIds,
}: {
  competitionId: string;
  judgeUserId: string;
  judgeName: string;
  allCategories: AssignableCategory[];
  assignedCategoryIds: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(assignedCategoryIds);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) setSelected(assignedCategoryIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/competitions/${competitionId}/judges/${judgeUserId}/categories`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ divisionIds: selected }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось сохранить категории.");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-app-sm px-1 py-0.5 text-left transition-colors hover:bg-admin-card2"
        title="Изменить категории судьи"
      >
        {assignedCategoryIds.length === 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-admin-card2 px-2.5 py-1 text-xs font-semibold text-night-warning">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-night-warning" aria-hidden="true" />
            Не назначен
          </span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {allCategories
              .filter((c) => assignedCategoryIds.includes(c.id))
              .map((c) => (
                <span
                  key={c.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-admin-border bg-admin-card2 px-2 py-0.5 text-xs font-medium text-night-text"
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: c.color }} aria-hidden="true" />
                  {c.name}
                </span>
              ))}
          </div>
        )}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div
            className="flex max-h-[88vh] w-full max-w-[440px] flex-col overflow-hidden rounded-app border border-admin-border bg-admin-card shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="assign-judge-categories-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-admin-border px-5 py-4">
              <h3 id="assign-judge-categories-title" className="m-0 text-[17px] font-extrabold text-night-text">
                Категории судьи
              </h3>
              <p className="m-0 mt-1.5 text-[12.5px] text-admin-muted">{judgeName}</p>
            </div>

            <div className="flex-1 overflow-y-auto py-1.5">
              {allCategories.length === 0 ? (
                <p className="m-0 px-5 py-4 text-sm text-admin-muted">В соревновании ещё нет категорий.</p>
              ) : (
                allCategories.map((c) => {
                  const checked = selected.includes(c.id);
                  return (
                    <label
                      key={c.id}
                      className="flex cursor-pointer items-center gap-3 px-5 py-2 hover:bg-admin-card2"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(c.id)}
                        className="h-[18px] w-[18px] shrink-0 accent-admin-primary"
                      />
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.color }} aria-hidden="true" />
                      <span className="truncate text-sm font-semibold text-night-text">{c.name}</span>
                    </label>
                  );
                })
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-admin-border px-5 py-4">
              <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                {error && <span className="max-w-[220px] text-xs text-red-400">{error}</span>}
                <Button type="button" size="sm" variant="ghost" className="text-admin-muted hover:text-admin-primaryHover" onClick={() => setOpen(false)}>
                  Отмена
                </Button>
                <Button type="button" size="sm" variant="admin" disabled={submitting} onClick={submit}>
                  Сохранить
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
