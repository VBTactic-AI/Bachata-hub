"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RegistrationStepper } from "./RegistrationStepper";

type DivisionOption = { id: string; categoryName: string };
type Role = "LEADER" | "FOLLOWER";
type Outcome = { divisionId: string; ok: boolean; pending?: boolean; message?: string };

const ROLE_LABEL: Record<Role, string> = { LEADER: "Партнёр", FOLLOWER: "Партнёрша" };

// Пошаговая регистрация (по референсу пользователя, 2026-09-04) поверх уже
// существующего API POST /api/competitions/[id]/registrations (CLAUDE.md §45,
// ничего нового на сервере не добавлено). Категория — ровно ОДНА на
// соревнование (по прямому запросу пользователя, 2026-09-10: раньше здесь
// был чекбокс-мультивыбор, сервер это тоже теперь отдельно отклоняет —
// register-competitor.ts, AlreadyRegisteredInCompetitionError — но фронт не
// должен и предлагать выбрать несколько). Шаг "Ваша роль" — отдельным полем
// перед категорией (роль обязательна, не выводится из пола — подтверждено
// пользователем, 2026-09-04), не как в референсе, где её нет.
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
  const [step, setStep] = useState(0); // 0 данные+роль, 1 категория, 2 подтверждение, 3 успех
  const [role, setRole] = useState<Role>(suggestedRole ?? "LEADER");
  const [selected, setSelected] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  async function onConfirm() {
    if (!selected) return;
    const divisionId = selected;
    setSubmitting(true);
    let result: Outcome;
    try {
      const res = await fetch(`/api/competitions/${competitionId}/registrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ divisionId, role }),
      });
      const data = await res.json().catch(() => ({}) as { error?: string; registration?: { roleOverrideStatus?: string } });
      if (!res.ok) {
        result = { divisionId, ok: false, message: data.error || "Не удалось зарегистрироваться." };
      } else {
        result = { divisionId, ok: true, pending: data.registration?.roleOverrideStatus === "PENDING" };
      }
    } catch {
      result = { divisionId, ok: false, message: "Нет связи с сервером — попробуйте ещё раз." };
    }
    setSubmitting(false);
    setOutcome(result);
    if (result.ok) {
      setStep(3);
      router.refresh();
    }
  }

  if (step === 3) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-night-cta text-3xl text-white">✓</div>
        <h1 className="m-0 font-night text-xl font-extrabold text-night-text">Вы успешно зарегистрированы!</h1>
        <p className="m-0 max-w-[320px] text-sm text-night-muted">
          Ждём вас на соревновании «{competitionName}».
          {outcome?.pending && " Роль отличалась от подсказки по полу — организатор подтвердит её перед check-in."}
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
            <h2 className="m-0 mb-2 font-night text-base font-bold text-night-text">Ваши данные</h2>
            <div className="rounded-app border border-night-border bg-night-card p-3 text-sm">
              <p className="m-0 text-night-text">{profileName || "Профиль будет создан автоматически"}</p>
              {cityName && <p className="m-0 mt-0.5 text-night-muted">{cityName}</p>}
              <Link href="/profile" className="mt-1.5 inline-block text-xs text-night-primary no-underline hover:underline">
                изменить в профиле
              </Link>
            </div>
          </div>
          <div>
            <h2 className="m-0 mb-1 font-night text-base font-bold text-night-text">Ваша роль</h2>
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
            <h2 className="m-0 mb-1 font-night text-base font-bold text-night-text">Выберите категорию</h2>
            <p className="m-0 text-xs text-night-muted">На одно соревнование — одна категория</p>
          </div>
          {divisions.length === 0 ? (
            <p className="hint-text text-night-muted">
              Свободных категорий не осталось — либо вы уже зарегистрированы, либо соревнование их пока не объявило.
            </p>
          ) : (
            <div className="stack gap-2" role="radiogroup" aria-label="Категория">
              {divisions.map((d) => {
                const checked = selected === d.id;
                return (
                  <label
                    key={d.id}
                    className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-app border p-3.5 text-sm transition-colors ${
                      checked
                        ? "border-night-primary bg-night-primary/15 text-night-text shadow-[0_0_0_3px_rgba(124,58,237,0.25)]"
                        : "border-night-border bg-night-card text-night-text"
                    }`}
                  >
                    <input type="radio" name="division" checked={checked} onChange={() => setSelected(d.id)} className="h-4 w-4 accent-night-primary" />
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
              disabled={selected === null}
              className="flex-[2] rounded-full bg-gradient-night-cta py-3.5 text-sm font-bold uppercase tracking-wide text-white disabled:opacity-40"
            >
              Далее →
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="stack gap-4">
          <h2 className="m-0 font-night text-base font-bold text-night-text">Подтверждение</h2>
          <div className="rounded-app border border-night-border bg-night-card p-4 text-sm">
            <p className="m-0 font-semibold text-night-text">{competitionName}</p>
            {dateLabel && <p className="m-0 mt-1 text-night-muted">{dateLabel}</p>}
            {placeLabel && <p className="m-0 text-night-muted">{placeLabel}</p>}
          </div>
          <div className="rounded-app border border-night-border bg-night-card p-4 text-sm">
            <p className="m-0 text-night-muted">Категория</p>
            <p className="m-0 mt-0.5 text-night-text">{divisions.find((d) => d.id === selected)?.categoryName}</p>
            <p className="m-0 mt-2 text-night-muted">Роль</p>
            <p className="m-0 mt-0.5 text-night-text">{ROLE_LABEL[role]}</p>
            <p className="m-0 mt-2 text-night-muted">Участник</p>
            <p className="m-0 mt-0.5 text-night-text">{profileName || "будет создано автоматически"}</p>
          </div>

          {outcome && !outcome.ok && (
            <div className="rounded-app border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
              <p className="m-0">{outcome.message}</p>
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
              disabled={submitting || selected === null}
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
