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
//
// Кандидатов выбирают всплывающим окном (по прямому запросу пользователя,
// 2026-09-09, "как в превью" — тот же макет, что был согласован ДО кода) —
// не инлайн-раскрытием: список с группами по категориям в узкой колонке
// захода не помещался читаемо.
function needVerb(role: "LEADER" | "FOLLOWER"): string {
  return role === "LEADER" ? "нужен партнёр" : "нужна партнёрша";
}

function candidateHint(g: HelperCandidateGroup, ownCategoryOrder: number): string {
  if (g.isOwnDivision) return "своя категория · уже отработали";
  return g.categoryOrder > ownCategoryOrder ? "категория выше" : "категория ниже";
}

export function AddDrawHelperForm({
  heatId,
  role,
  categoryName,
  categoryOrder,
  roundName,
  heatNumber,
}: {
  heatId: string;
  role: "LEADER" | "FOLLOWER";
  categoryName: string;
  categoryOrder: number;
  roundName: string;
  heatNumber: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState<HelperCandidateGroup[]>([]);
  const [neededCount, setNeededCount] = useState(1);
  const [suggestedId, setSuggestedId] = useState<string | null>(null);
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
        setSuggestedId(data.suggestedRegistrationId);
        setSelected(data.suggestedRegistrationId ? [data.suggestedRegistrationId] : []);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Не удалось загрузить список кандидатов.");
        setGroups([]);
      })
      .finally(() => setLoadingCandidates(false));
  }, [open, role, heatId]);

  // Esc закрывает модалку — стандартное ожидание для fixed-оверлея.
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

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="adminOutline"
        className="border-night-warning/50 bg-night-warning/10 text-night-warning hover:border-night-warning hover:bg-night-warning/15 hover:text-night-warning"
        onClick={() => setOpen(true)}
      >
        + Помощник ({ROLE_LABELS[role] ?? role})
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div
            className="flex max-h-[88vh] w-full max-w-[520px] flex-col overflow-hidden rounded-app border border-admin-border bg-admin-card shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-draw-helper-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-admin-border px-5 py-4">
              <h3 id="add-draw-helper-title" className="m-0 text-[17px] font-extrabold text-night-text">
                Позвать помощника на паркет
              </h3>
              <p className="m-0 mt-1.5 text-[12.5px] text-admin-muted">
                {categoryName} · {roundName} · Заход {heatNumber} — {needVerb(role)}, чтобы стороны сошлись.
              </p>
              <span className="mt-2.5 inline-flex items-center gap-2 rounded-full border border-night-warning/30 bg-night-warning/10 px-3 py-1.5 text-xs font-bold text-night-warning">
                Не хватает: {ROLE_LABELS[role] ?? role} — выбрано {selected.length} из {neededCount}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto py-1.5">
              {loadingCandidates ? (
                <p className="m-0 px-5 py-4 text-sm text-admin-muted">Загрузка…</p>
              ) : groups.length === 0 ? (
                <p className="m-0 px-5 py-4 text-sm text-admin-muted">Нет доступных кандидатов.</p>
              ) : (
                groups.map((g) => (
                  <div key={g.divisionId}>
                    <p className="m-0 px-5 pb-1 pt-3 text-[10.5px] font-bold uppercase tracking-wider text-admin-disabled">
                      {g.categoryName} <span className="text-admin-primaryHover">· {candidateHint(g, categoryOrder)}</span>
                    </p>
                    {g.registrations.map((r) => {
                      const checked = selected.includes(r.id);
                      const disabled = !checked && selected.length >= neededCount;
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
                          {r.id === suggestedId && (
                            <span className="ml-auto shrink-0 text-[11px] font-semibold text-admin-primaryHover">рекомендуется</span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                ))
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-admin-border px-5 py-4">
              <p className="m-0 max-w-[230px] text-[11.5px] leading-snug text-admin-disabled">
                Помощник танцует, но его не оценивают — на результат захода он не влияет.
              </p>
              {/* Ошибка — слева от кнопок, в одной строке с ними (2026-09-09):
                  весь этот кластер прижат вправо через ml-auto, так что текст
                  занимает свободное место перед кнопками, а не разрывает
                  строку. */}
              <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                {error && <span className="text-xs text-red-400">{error}</span>}
                <Button type="button" size="sm" variant="ghost" className="text-admin-muted hover:text-admin-primaryHover" onClick={() => setOpen(false)}>
                  Отмена
                </Button>
                <Button type="button" size="sm" variant="admin" disabled={submitting || selected.length === 0} onClick={submit}>
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
