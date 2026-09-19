"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Select, Textarea, Label, FormRoot } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { DateTimeField } from "@/components/ui/DateTimeField";
import { cn } from "@/lib/cn";
import { formatEventDateRange } from "@/lib/format";
import type { CityOption } from "./FestivalOverviewForm";
import { ProgramItemFormModal, type ProgramItemFormValue, type TeacherOption, type LinkedEventOption } from "./ProgramItemFormModal";
import { FestivalFirstPassForm, type CreatedFestivalPass } from "./FestivalFirstPassForm";

const FIELD_CLASS = "border-admin-border bg-admin-card2 text-night-text focus:border-admin-primary focus:ring-admin-primary/20";

const TYPE_CHIP_COLOR: Record<string, string> = {
  WORKSHOP: "bg-admin-primary",
  PARTY: "bg-admin-violet",
  COMPETITION: "bg-night-warning",
  OTHER: "bg-admin-disabled",
};

type Step = 1 | 2 | 3;

const STEPS: { step: Step; label: string; required: boolean }[] = [
  { step: 1, label: "Основное", required: true },
  { step: 2, label: "Программа", required: false },
  { step: 3, label: "Пассы", required: false },
];

// Мастер создания фестиваля — Stage R2 переноса UI-прототипа (2026-09-19,
// docs/FESTIVAL_SERVICE_LAYER_PLAN.md). Заменяет прежнюю однострочную форму
// (FestivalCreateForm) 3 шагами (Основное обязательно, Программа/Пассы —
// опционально) + живым превью карточки, по образцу UI-прототипа.
//
// В отличие от EventWizard.tsx (весь черновик — клиентское состояние,
// отправляется одним POST/PATCH) Festival создаётся сразу на шаге 1 —
// "Программа"/"Пассы" физически не могут существовать без festivalId
// (отдельные API-роуты `/api/festivals/[id]/program-items` и `/passes`,
// см. docs/FESTIVAL_SERVICE_LAYER_PLAN.md, Stage 1). Каждый добавленный на
// шаге 2/3 пункт/Pass сохраняется в БД сразу же (через существующие
// ProgramItemFormModal/FestivalFirstPassForm), локальный список здесь — не
// источник истины, просто отображение уже сохранённого, чтобы избежать
// повторного щёлканья по API на каждый "Назад"/"Далее".
export function FestivalCreateWizard({
  cities,
  teachers,
  linkedEventOptions,
}: {
  cities: CityOption[];
  teachers: TeacherOption[];
  linkedEventOptions: LinkedEventOption[];
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [festivalId, setFestivalId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [cityId, setCityId] = useState(cities[0]?.id ?? "");
  const [venueName, setVenueName] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");

  const [savingBasic, setSavingBasic] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [programItems, setProgramItems] = useState<ProgramItemFormValue[]>([]);
  const [showItemModal, setShowItemModal] = useState(false);

  const [passes, setPasses] = useState<CreatedFestivalPass[]>([]);

  const cityName = cities.find((c) => c.id === cityId)?.nameRu ?? "";
  const canGoNextFromBasic = Boolean(name.trim() && cityId && startsAt);

  async function handleBasicNext() {
    setSavingBasic(true);
    setError(null);
    try {
      const payload = {
        name,
        description: description.trim() || null,
        cityId,
        venueName: venueName.trim() || null,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
      };
      const res = await fetch(festivalId ? `/api/festivals/${festivalId}` : "/api/festivals", {
        method: festivalId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.message ?? "Не удалось сохранить фестиваль.");
        return;
      }
      setFestivalId(data.festival.id);
      setStep(2);
    } finally {
      setSavingBasic(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <a href="/admin/festival" className="text-sm text-admin-muted hover:text-night-text hover:underline">
        ← Все фестивали
      </a>

      <div className="grid gap-5 lg:grid-cols-[172px_1fr_260px]">
        {/* Рельс шагов */}
        <nav className="flex flex-row gap-1 overflow-x-auto lg:flex-col lg:gap-0.5 lg:overflow-visible">
          {STEPS.map((s) => {
            const active = s.step === step;
            const done = festivalId !== null && s.step < step;
            const disabled = s.step !== 1 && festivalId === null;
            return (
              <button
                key={s.step}
                type="button"
                disabled={disabled}
                onClick={() => !disabled && setStep(s.step)}
                className={cn(
                  "flex shrink-0 items-start gap-2 rounded-app-sm p-2 text-left text-sm font-semibold",
                  active ? "bg-admin-primary/15 text-night-text" : "text-admin-muted hover:bg-white/5",
                  disabled && "cursor-not-allowed opacity-50"
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-[21px] w-[21px] shrink-0 items-center justify-center rounded-full border text-[11px] font-extrabold",
                    active
                      ? "border-admin-primary bg-admin-primary text-white"
                      : done
                        ? "border-night-success bg-night-success/10 text-night-success"
                        : "border-admin-border text-admin-muted"
                  )}
                >
                  {s.step}
                </span>
                <span className="flex flex-col gap-1">
                  <span>{s.label}</span>
                  <span
                    className={cn(
                      "w-fit rounded-full px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide",
                      s.required ? "bg-red-400/15 text-red-400" : "bg-admin-muted/15 text-admin-muted"
                    )}
                  >
                    {s.required ? "Обязательно" : "Опционально"}
                  </span>
                </span>
              </button>
            );
          })}
        </nav>

        {/* Содержимое шага */}
        <div className="min-w-0 rounded-app border border-admin-border bg-admin-card p-5">
          {error && <p className="m-0 mb-3 text-sm text-red-400">{error}</p>}

          {step === 1 && (
            <FormRoot
              onSubmit={(e) => {
                e.preventDefault();
                handleBasicNext();
              }}
            >
              <Label>
                Название фестиваля
                <Input className={FIELD_CLASS} value={name} onChange={(e) => setName(e.target.value)} required placeholder="Grodno Latina Fest" />
              </Label>

              <Label>
                Описание
                <Textarea className={FIELD_CLASS} value={description} onChange={(e) => setDescription(e.target.value)} />
              </Label>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Label>
                  Город
                  <Select className={FIELD_CLASS} value={cityId} onChange={(e) => setCityId(e.target.value)} required>
                    {cities.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nameRu}
                      </option>
                    ))}
                  </Select>
                </Label>
                <Label>
                  Площадка
                  <Input className={FIELD_CLASS} value={venueName} onChange={(e) => setVenueName(e.target.value)} />
                </Label>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Label>
                  Начало
                  <DateTimeField value={startsAt} onChange={setStartsAt} theme="admin" className={FIELD_CLASS} required />
                </Label>
                <Label>
                  Окончание
                  <DateTimeField value={endsAt} onChange={setEndsAt} theme="admin" className={FIELD_CLASS} />
                </Label>
              </div>
            </FormRoot>
          )}

          {step === 2 && festivalId && (
            <div className="flex flex-col gap-3">
              <h4 className="m-0 text-sm font-extrabold text-night-text">Программа</h4>
              {programItems.length === 0 ? (
                <p className="m-0 text-sm text-admin-muted">Программа пока пуста — можно пропустить и заполнить позже, в консоли фестиваля.</p>
              ) : (
                <div className="flex flex-col">
                  {programItems.map((item) => (
                    <div key={item.id} className="flex items-center gap-2.5 border-b border-admin-border py-2 text-sm last:border-none">
                      <span className={cn("h-2 w-2 shrink-0 rounded-sm", TYPE_CHIP_COLOR[item.type] ?? TYPE_CHIP_COLOR.OTHER)} aria-hidden="true" />
                      <span className="flex-1 truncate text-night-text">{item.title}</span>
                      <span className="shrink-0 text-xs text-admin-muted">{new Date(item.startTime).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  ))}
                </div>
              )}
              <Button type="button" variant="adminOutline" size="sm" className="w-fit" onClick={() => setShowItemModal(true)}>
                Добавить пункт программы
              </Button>

              {showItemModal && (
                <ProgramItemFormModal
                  festivalId={festivalId}
                  mode="create"
                  teachers={teachers}
                  linkedEventOptions={linkedEventOptions}
                  onClose={() => setShowItemModal(false)}
                  onSaved={(item) => setProgramItems((items) => [...items, item])}
                />
              )}
            </div>
          )}

          {step === 3 && festivalId && (
            <div className="flex flex-col gap-3">
              <h4 className="m-0 text-sm font-extrabold text-night-text">Пассы</h4>
              {passes.length === 0 ? (
                <p className="m-0 text-sm text-admin-muted">Пассов пока нет — можно пропустить и заполнить позже, в консоли фестиваля.</p>
              ) : (
                <div className="flex flex-col">
                  {passes.map((p) => (
                    <div key={p.id} className="flex items-center gap-2.5 border-b border-admin-border py-2 text-sm last:border-none">
                      <span className="text-base" aria-hidden="true">
                        🎫
                      </span>
                      <span className="flex-1 truncate text-night-text">{p.name}</span>
                      <span className="shrink-0 text-xs text-admin-muted">{p.price != null ? `${p.price} ${p.currency ?? "BYN"}` : "Бесплатно"}</span>
                    </div>
                  ))}
                </div>
              )}
              <FestivalFirstPassForm festivalId={festivalId} compact onCreated={(pass) => setPasses((list) => [...list, pass])} />
            </div>
          )}

          <div className="mt-5 flex items-center justify-between border-t border-admin-border pt-4">
            <Button type="button" variant="adminOutline" size="sm" disabled={step === 1} onClick={() => setStep((s) => (s === 3 ? 2 : 1))}>
              ← Назад
            </Button>
            {step < 3 ? (
              step === 1 ? (
                <Button type="button" variant="admin" size="sm" disabled={!canGoNextFromBasic || savingBasic} onClick={handleBasicNext}>
                  {savingBasic ? "Сохранение…" : "Далее →"}
                </Button>
              ) : (
                <Button type="button" variant="admin" size="sm" onClick={() => setStep(3)}>
                  {programItems.length > 0 ? "Далее →" : "Пропустить →"}
                </Button>
              )
            ) : (
              <Button type="button" variant="admin" size="sm" onClick={() => festivalId && router.push(`/admin/festival/${festivalId}`)}>
                Готово
              </Button>
            )}
          </div>
        </div>

        {/* Живое превью карточки */}
        <div className="lg:sticky lg:top-0">
          <p className="m-0 mb-2 text-xs font-semibold uppercase tracking-wide text-admin-muted">Так это увидят на сайте</p>
          <div className="overflow-hidden rounded-app border border-night-border bg-night-card">
            <div className="relative flex aspect-video items-center justify-center bg-gradient-to-br from-[#1d2b52] to-[#241a30] text-3xl">
              <span aria-hidden="true">🎪</span>
              <span className="absolute right-2.5 top-2.5 rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-white">
                {festivalId ? "черновик" : "не сохранено"}
              </span>
            </div>
            <div className="flex flex-col p-4">
              <span className="mb-2 w-fit rounded-full bg-night-card2 px-2.5 py-1 text-[10px] font-bold text-night-pink">Фестиваль</span>
              <strong className="mb-2 truncate text-night-text">{name || "Название фестиваля"}</strong>
              <p className="m-0 mb-1 text-xs text-night-muted">📅 {startsAt ? formatEventDateRange(new Date(startsAt), endsAt ? new Date(endsAt) : null) : "Дата не выбрана"}</p>
              <p className="m-0 text-xs text-night-muted">📍 {cityName || "Город не выбран"}</p>
            </div>
          </div>
          <p className="m-0 mt-2.5 text-xs text-admin-muted">
            Черновик не публичен, пока не опубликован отдельно в консоли фестиваля.
          </p>
        </div>
      </div>
    </div>
  );
}
