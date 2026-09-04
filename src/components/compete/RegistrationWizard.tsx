"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RegistrationStepper } from "./RegistrationStepper";

type DivisionOption = { id: string; categoryName: string };
type Role = "LEADER" | "FOLLOWER";
type Outcome = { divisionId: string; ok: boolean; pending?: boolean; message?: string };

const ROLE_LABEL: Record<Role, string> = { LEADER: "Ведущий", FOLLOWER: "Ведомый" };

// Пошаговая регистрация (по референсу пользователя, 2026-09-04) поверх уже
// существующего API POST /api/competitions/[id]/registrations — один вызов
// на один дивизион (CLAUDE.md §45, ничего нового на сервере не добавлено):
// при нескольких выбранных категориях зовём его последовательно по кругу,
// а не выдумываем несуществующий bulk-эндпоинт. Шаг "Ваша роль" — отдельным
// полем перед категориями (роль обязательна, не выводится из пола —
// подтверждено пользователем, 2026-09-04), не как в референсе, где её нет.
export function RegistrationWizard({
  competitionId,
  competitionName,
  dateLabel,
  placeLabel,
  divisions,
  profileName,
  cityName,
  suggestedRole,
}: {
  competitionId: string;
  competitionName: string;
  dateLabel: string | null;
  placeLabel: string | null;
  divisions: DivisionOption[];
  profileName: string | null;
  cityName: string | null;
  suggestedRole: Role | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0); // 0 данные+роль, 1 категории, 2 подтверждение, 3 успех
  const [role, setRole] = useState<Role>(suggestedRole ?? "LEADER");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);

  function toggleDivision(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onConfirm() {
    setSubmitting(true);
    const results: Outcome[] = [];
    for (const divisionId of selected) {
      try {
        const res = await fetch(`/api/competitions/${competitionId}/registrations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ divisionId, role }),
        });
        const data = await res.json().catch(() => ({}) as { error?: string; registration?: { roleOverrideStatus?: string } });
        if (!res.ok) {
          results.push({ divisionId, ok: false, message: data.error || "Не удалось зарегистрироваться." });
        } else {
          results.push({ divisionId, ok: true, pending: data.registration?.roleOverrideStatus === "PENDING" });
        }
      } catch {
        results.push({ divisionId, ok: false, message: "Нет связи с сервером — попробуйте ещё раз." });
      }
    }
    setSubmitting(false);
    setOutcomes(results);
    // Успешные — больше не переотправляем при повторном клике "Подтвердить"
    // (повторный вызов на них всё равно вернул бы "уже зарегистрированы").
    setSelected(new Set(results.filter((r) => !r.ok).map((r) => r.divisionId)));
    if (results.every((r) => r.ok)) {
      setStep(3);
      router.refresh();
    }
  }

  if (step === 3) {
    const anyPending = outcomes.some((o) => o.pending);
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-night-cta text-3xl text-white">✓</div>
        <h1 className="m-0 font-display text-xl font-extrabold text-night-text">Вы успешно зарегистрированы!</h1>
        <p className="m-0 max-w-[320px] text-sm text-night-muted">
          Ждём вас на соревновании «{competitionName}».
          {anyPending && " По одной из категорий роль отличалась от подсказки по полу — организатор подтвердит её перед check-in."}
        </p>
        <Link
          href="/compete"
          className="mt-2 rounded-full bg-gradient-night-cta px-6 py-3 text-sm font-bold uppercase tracking-wide text-white no-underline"
        >
          На главную
        </Link>
      </div>
    );
  }

  return (
    <div className="stack gap-5 pb-4">
      <RegistrationStepper current={step} />

      {step === 0 && (
        <div className="stack gap-4">
          <div>
            <h2 className="m-0 mb-2 font-display text-base font-bold text-night-text">Ваши данные</h2>
            <div className="rounded-app border border-night-border bg-night-card p-3 text-sm">
              <p className="m-0 text-night-text">{profileName || "Профиль будет создан автоматически"}</p>
              {cityName && <p className="m-0 mt-0.5 text-night-muted">{cityName}</p>}
              <Link href="/profile" className="mt-1.5 inline-block text-xs text-night-primary no-underline hover:underline">
                изменить в профиле
              </Link>
            </div>
          </div>
          <div>
            <h2 className="m-0 mb-1 font-display text-base font-bold text-night-text">Ваша роль</h2>
            <p className="m-0 mb-2 text-xs text-night-muted">Роль в паре — обязательно для судейства</p>
            <div className="grid grid-cols-2 gap-2.5">
              {(["LEADER", "FOLLOWER"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  aria-pressed={role === r}
                  className={`rounded-app border p-4 text-center text-sm font-semibold transition-colors ${
                    role === r
                      ? "border-night-primary bg-night-primary/15 text-night-text shadow-[0_0_0_3px_rgba(124,58,237,0.25)]"
                      : "border-night-border bg-night-card text-night-muted"
                  }`}
                >
                  {ROLE_LABEL[r]}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setStep(1)}
            className="rounded-full bg-gradient-night-cta py-3.5 text-sm font-bold uppercase tracking-wide text-white"
          >
            Далее →
          </button>
        </div>
      )}

      {step === 1 && (
        <div className="stack gap-3">
          <div>
            <h2 className="m-0 mb-1 font-display text-base font-bold text-night-text">Выберите категории</h2>
            <p className="m-0 text-xs text-night-muted">Можно выбрать несколько</p>
          </div>
          {divisions.length === 0 ? (
            <p className="hint-text text-night-muted">
              Свободных категорий не осталось — либо вы уже зарегистрированы во всех, либо соревнование их пока не объявило.
            </p>
          ) : (
            <div className="stack gap-2">
              {divisions.map((d) => {
                const checked = selected.has(d.id);
                return (
                  <label
                    key={d.id}
                    className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-app border p-3.5 text-sm transition-colors ${
                      checked
                        ? "border-night-primary bg-night-primary/15 text-night-text shadow-[0_0_0_3px_rgba(124,58,237,0.25)]"
                        : "border-night-border bg-night-card text-night-text"
                    }`}
                  >
                    <input type="checkbox" checked={checked} onChange={() => toggleDivision(d.id)} className="h-4 w-4 accent-night-primary" />
                    {d.categoryName}
                    {checked && <span className="ml-auto text-night-pink">✓</span>}
                  </label>
                );
              })}
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStep(0)}
              className="flex-1 rounded-full border border-night-border py-3.5 text-sm font-semibold text-night-muted"
            >
              Назад
            </button>
            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={selected.size === 0}
              className="flex-[2] rounded-full bg-gradient-night-cta py-3.5 text-sm font-bold uppercase tracking-wide text-white disabled:opacity-40"
            >
              Далее →
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="stack gap-4">
          <h2 className="m-0 font-display text-base font-bold text-night-text">Подтверждение</h2>
          <div className="rounded-app border border-night-border bg-night-card p-4 text-sm">
            <p className="m-0 font-semibold text-night-text">{competitionName}</p>
            {dateLabel && <p className="m-0 mt-1 text-night-muted">{dateLabel}</p>}
            {placeLabel && <p className="m-0 text-night-muted">{placeLabel}</p>}
          </div>
          <div className="rounded-app border border-night-border bg-night-card p-4 text-sm">
            <p className="m-0 text-night-muted">Категории</p>
            <p className="m-0 mt-0.5 text-night-text">
              {divisions
                .filter((d) => selected.has(d.id))
                .map((d) => d.categoryName)
                .join(", ")}
            </p>
            <p className="m-0 mt-2 text-night-muted">Роль</p>
            <p className="m-0 mt-0.5 text-night-text">{ROLE_LABEL[role]}</p>
            <p className="m-0 mt-2 text-night-muted">Участник</p>
            <p className="m-0 mt-0.5 text-night-text">{profileName || "будет создано автоматически"}</p>
          </div>

          {outcomes.some((o) => !o.ok) && (
            <div className="rounded-app border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
              {outcomes
                .filter((o) => !o.ok)
                .map((o) => (
                  <p key={o.divisionId} className="m-0">
                    {divisions.find((d) => d.id === o.divisionId)?.categoryName}: {o.message}
                  </p>
                ))}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStep(1)}
              disabled={submitting}
              className="flex-1 rounded-full border border-night-border py-3.5 text-sm font-semibold text-night-muted"
            >
              Назад
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={submitting || selected.size === 0}
              className="flex-[2] rounded-full bg-gradient-night-cta py-3.5 text-sm font-bold uppercase tracking-wide text-white disabled:opacity-60"
            >
              {submitting ? "Отправляем…" : "Подтвердить регистрацию"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
