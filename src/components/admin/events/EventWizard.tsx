"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EVENT_TYPE_REGISTRY, computePublishChecklist, isChecklistComplete, type EventStepId } from "@/lib/events/event-type-registry";
import { formatEventTime, formatDateTime } from "@/lib/format";
import { WizardNav } from "./WizardNav";
import { EventTypeSelector } from "./EventTypeSelector";
import { EventPreviewSidebar } from "./EventPreviewSidebar";
import { StepBasic } from "./steps/StepBasic";
import { StepDateTime } from "./steps/StepDateTime";
import { StepPartyDetails } from "./steps/StepPartyDetails";
import { StepSessions } from "./steps/StepSessions";
import { StepMasterclassDetails } from "./steps/StepMasterclassDetails";
import { StepTickets } from "./steps/StepTickets";
import { StepPublish } from "./steps/StepPublish";
import { StepRecurrence } from "./steps/StepRecurrence";
import { toApiPayload, type WizardDraft } from "./wizard-types";

// Event Engine — единый Create Event Wizard (задача "ОБЩИЙ CREATE EVENT
// ENGINE"): один компонент управляет состоянием черновика и навигацией,
// набор шагов приходит из EVENT_TYPE_REGISTRY (src/lib/events/
// event-type-registry.ts) по текущему draft.format — никаких if(type===...)
// в отдельных шагах, только ОДНА диспетчеризация step-id -> компонент, здесь.
//
// Редизайн (2026-09-16, по прямому запросу пользователя, макет согласован
// заранее в артефакте): "Тип" и "Место" больше не отдельные шаги — выбор
// типа события (EventTypeSelector) и живой предпросмотр (EventPreviewSidebar)
// теперь ПОСТОЯННЫЕ боковые колонки, видны на каждом шаге (не только на
// первом), а не собственные полноэкранные шаги.
//
// Уточнение того же дня: раньше колонка EventTypeSelector рендерилась ТОЛЬКО
// на шаге "basic" (3 колонки), на остальных шагах сетка была из 2 колонок —
// из-за этого форма визуально "прыгала" по горизонтали при "Далее"/"Назад"
// (левый край формы сдвигался на ширину колонки селектора). Теперь сетка
// [220px_1fr_320px] одна и та же на ВСЕХ шагах, включая "basic" — селектор
// зафиксирован слева всегда, содержимое шага растягивается на всю ширину
// средней колонки (без центрирования и без узкого max-w — сами Step-
// компоненты растянуты на 100% ширины, CLAUDE.md §54: поля Input/Select и
// так уже `w-full` по умолчанию, см. src/components/ui/field.tsx).
// Смена формата сбрасывает stepIndex на 0 — набор шагов зависит от формата
// (EVENT_TYPE_REGISTRY), и без сброса номер шага мог бы указывать на другой,
// не тот шаг после смены формата на середине мастера.
export function EventWizard({
  cities,
  ownedSchools,
  teachers,
  isVerifiedEventOrganizer = false,
  initialDraft,
  basePath = "/admin/content",
}: {
  cities: { id: string; nameRu: string }[];
  ownedSchools: { id: string; name: string; verificationStatus: "COMMUNITY" | "VERIFIED" }[];
  teachers: { id: string; name: string }[];
  // QA BUG-012 — "будет опубликовано без модерации" должно совпадать с
  // реальным shouldAutoApproveEvent() на сервере (ADMIN или верифицированный
  // организатор), а не только с верифицированной школой.
  isVerifiedEventOrganizer?: boolean;
  initialDraft: WizardDraft;
  // Редизайн (2026-09-16, по прямому запросу пользователя) — список "Мои
  // события" переехал на отдельную табличную страницу (admin/content/
  // page.tsx), мастер больше не рендерит его внутри себя. basePath различает
  // "свои события" (/admin/content) и "все события" (/admin/system/events,
  // Мониторинг) — используется только для редиректа на страницу
  // редактирования сразу после первого сохранения черновика (см. save()
  // ниже), чтобы URL стал `${basePath}/edit/${id}`, а не остался на "/new".
  basePath?: string;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<WizardDraft>(initialDraft);
  const [stepIndex, setStepIndex] = useState(0);
  const [saving, setSaving] = useState<"draft" | "publish" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  // "Сохранено в HH:MM" рядом с кнопкой (2026-09-16, по итогам UX-ревью) —
  // раньше кнопка ничем не подтверждала, что черновик реально сохранился и
  // когда: спиннер мелькал и пропадал, а дальше — тишина.
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  const config = EVENT_TYPE_REGISTRY[draft.format];
  // "recurrence" — виртуальный шаг, не часть EVENT_TYPE_REGISTRY (не зависит
  // от формата события, см. комментарий у EventStepId) — добавляется в конец,
  // как только отмечено "Сделать регулярным". После успешного сохранения
  // серии (draft.seriesId) мастер сразу редиректит на карточку серии, поэтому
  // не отдельно скрывает шаг обратно — компонент к этому моменту уже уходит.
  const steps = draft.makeRecurring ? [...config.steps, "recurrence" as const] : config.steps;
  const currentStep = steps[Math.min(stepIndex, steps.length - 1)];

  const checklist = useMemo(
    () =>
      computePublishChecklist(draft.format, {
        title: draft.title,
        cityId: draft.cityId,
        venueName: draft.venueName,
        startsAt: draft.startsAt,
        masterclassSessions: draft.masterclass.sessions.map((s) => ({ teacherId: s.teacherId || null })),
      }),
    [draft.format, draft.title, draft.cityId, draft.venueName, draft.startsAt, draft.masterclass.sessions]
  );
  const checklistById = useMemo(() => Object.fromEntries(checklist.map((c) => [c.id, c.ok])), [checklist]);
  const complete = isChecklistComplete(checklist);
  const canSaveDraft = !!(checklistById.title && checklistById.city && checklistById.venue && checklistById.startsAt);

  const doneMap: Record<string, boolean> = {
    basic: !!(checklistById.title && checklistById.city && checklistById.venue),
    datetime: !!checklistById.startsAt,
    sessions: !!(checklistById.sessions && checklistById.instructor),
    partyDetails: true,
    details: true,
    tickets: true,
    publish: complete,
    recurrence: !!draft.seriesId,
  };

  function patch(p: Partial<WizardDraft>) {
    setDraft((d) => ({ ...d, ...p }));
  }

  async function save(status: "DRAFT" | "PUBLISHED") {
    setSaving(status === "DRAFT" ? "draft" : "publish");
    setError(null);
    setSuccessMessage(null);
    try {
      const payload = toApiPayload(draft, status);
      const res = await fetch(draft.id ? `/api/event-drafts/${draft.id}` : "/api/events", {
        method: draft.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        // CLAUDE.md §46 — раньше любая причина, кроме publish_incomplete
        // (в т.ч. осмысленное сообщение от сервера в body.message —
        // EVENT_FORBIDDEN_MESSAGES, или not_found), схлопывалась в один и
        // тот же неинформативный текст, и было невозможно понять, что
        // реально пошло не так (найдено вживую по прямому отчёту
        // пользователя — "пишет ошибку, но не понятно почему").
        if (body?.error === "publish_incomplete") {
          setError("Заполните обязательные поля.");
        } else if (body?.message) {
          setError(body.message);
        } else if (body?.error === "not_found") {
          setError("Черновик не найден — возможно, он был удалён. Обновите страницу.");
        } else if (body?.error === "invalid_input") {
          setError("Проверьте заполненные поля — часть данных некорректна.");
        } else {
          setError("Не удалось сохранить событие.");
        }
        return;
      }
      const isFirstSave = !draft.id;
      const eventId: string = body.event.id;
      setLastSavedAt(new Date());
      setDraft((d) => ({
        ...d,
        id: eventId,
        slug: body.event.slug,
        status: body.event.status,
        competitionId: body.competitionId ?? d.competitionId,
      }));
      // Recurring Events v2 — найдено вживую при первой проверке: router.replace
      // размонтирует EventWizard (переход на другой page.tsx = другой
      // initialDraft с сервера) и стирает stepIndex/makeRecurring/makeTemplate —
      // организатора выкидывало с только что появившегося шага "Повторение"
      // обратно на шаг 1. Если дальше открывается "Повторение" — редирект
      // на /edit/[id] пропускаем: URL обновится сам через router.push на
      // карточку серии сразу по завершении (StepRecurrence::onSaved ниже),
      // а до этого момента переход на /edit/[id] не даёт ничего, кроме риска
      // потерять состояние мастера.
      const willShowRecurrenceStep = status === "PUBLISHED" && draft.makeRecurring;
      if (isFirstSave && !willShowRecurrenceStep) {
        // Первое сохранение черновика создаёт Event — переезжаем с "/new" на
        // постоянный URL редактирования, чтобы обновление страницы и "Мои
        // события" вели на тот же черновик, а не на пустую форму.
        router.replace(`${basePath}/edit/${eventId}`);
      }
      if (status === "PUBLISHED") {
        // Recurring Events v2: "Сохранить как шаблон" — фоновым действием
        // сразу после публикации, не блокирует и не отменяет сам факт
        // публикации, если вдруг не удастся (сообщаем отдельной, некритичной
        // ошибкой, не ошибкой всей операции).
        if (draft.makeTemplate) {
          try {
            const tRes = await fetch(`/api/event-drafts/${eventId}/save-as-template`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: draft.templateName || undefined }),
            });
            if (!tRes.ok) setError("Событие опубликовано, но шаблон сохранить не удалось — попробуйте ещё раз со страницы события.");
          } catch {
            setError("Событие опубликовано, но шаблон сохранить не удалось — проверьте соединение.");
          }
        }

        const approved = body.event.moderationStatus === "APPROVED";
        if (draft.makeRecurring) {
          // Публикация уже произошла — остаёмся в мастере и открываем
          // добавленный шаг "Повторение" (createSeriesFromEvent донастроит
          // серию отдельным явным действием там же, не здесь).
          setSuccessMessage(approved ? "Событие опубликовано! Настройте повторение ниже." : "Событие отправлено на модерацию. Настройте повторение ниже.");
          setStepIndex(steps.length - 1);
        } else {
          // Задача: после публикации показать понятное сообщение
          // (опубликовано / на модерации) и перекинуть на карточку события,
          // чтобы организатор сразу проверил, всё ли заполнено верно.
          setSuccessMessage(approved ? "Событие опубликовано! Открываем карточку…" : "Событие отправлено на модерацию. Открываем карточку…");
          setTimeout(() => router.push(`/events/${body.event.slug}`), 1400);
        }
      }
    } catch {
      setError("Не удалось сохранить событие — проверьте соединение.");
    } finally {
      setSaving(null);
    }
  }

  const selectedSchool = ownedSchools.find((s) => s.id === draft.schoolId);
  const willAutoApprove = isVerifiedEventOrganizer || !!(selectedSchool && selectedSchool.verificationStatus === "VERIFIED");
  const cityName = cities.find((c) => c.id === draft.cityId)?.nameRu ?? "";
  const organizerLabel = selectedSchool?.name ?? draft.organizerName;

  function renderStep(step: EventStepId) {
    switch (step) {
      case "basic":
        return <StepBasic draft={draft} onChange={patch} cities={cities} />;
      case "datetime":
        return <StepDateTime draft={draft} onChange={patch} />;
      case "partyDetails":
        return <StepPartyDetails draft={draft} onChange={(p) => patch({ party: { ...draft.party, ...p } })} />;
      case "sessions":
        return (
          <StepSessions
            sessions={draft.masterclass.sessions}
            onChange={(sessions) => patch({ masterclass: { ...draft.masterclass, sessions } })}
            teachers={teachers}
          />
        );
      case "details":
        return <StepMasterclassDetails draft={draft} onChange={(p) => patch({ masterclass: { ...draft.masterclass, ...p } })} />;
      case "tickets":
        return <StepTickets draft={draft} onChange={patch} />;
      case "publish":
        return (
          <StepPublish
            checklist={checklist}
            complete={complete}
            willAutoApprove={willAutoApprove}
            isCompetition={draft.format === "CONTEST"}
            competitionId={draft.competitionId}
            saving={saving === "publish"}
            onPublish={() => save("PUBLISHED")}
            makeTemplate={draft.makeTemplate}
            onChangeMakeTemplate={(v) => patch({ makeTemplate: v })}
            templateName={draft.templateName}
            onChangeTemplateName={(v) => patch({ templateName: v })}
            makeRecurring={draft.makeRecurring}
            onChangeMakeRecurring={(v) => patch({ makeRecurring: v })}
            alreadyInSeries={!!draft.seriesId}
          />
        );
      case "recurrence":
        return draft.id ? (
          <StepRecurrence
            eventId={draft.id}
            eventTitle={draft.title}
            eventDateTimeLabel={draft.startsAt ? formatDateTime(new Date(draft.startsAt)) : ""}
            value={draft.recurrence}
            onChange={(p) => patch({ recurrence: { ...draft.recurrence, ...p } })}
            onSaved={(seriesId) => {
              patch({ seriesId });
              router.push(`/admin/content/series/${seriesId}`);
            }}
          />
        ) : null;
    }
  }

  const previewSidebar = <EventPreviewSidebar draft={draft} cityName={cityName} organizerLabel={organizerLabel} slug={draft.slug ?? null} />;

  // "Назад"/"Далее" продублированы у степпера (2026-09-16, по прямому запросу
  // пользователя) — раньше были только внизу карточки, на длинных шагах
  // (список занятий/программы) приходилось прокручивать вниз-вверх на каждый
  // клик. Внизу кнопки оставлены как есть — тот же переход, тот же обработчик.
  const stepNavButtons = (
    <div className="flex shrink-0 items-center gap-2">
      <Button
        type="button"
        variant="adminOutline"
        size="sm"
        disabled={stepIndex === 0}
        onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
      >
        ← Назад
      </Button>
      {currentStep !== "publish" && currentStep !== "recurrence" && (
        <Button type="button" variant="admin" size="sm" onClick={() => setStepIndex((i) => Math.min(steps.length - 1, i + 1))}>
          Далее →
        </Button>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <a href={basePath} className="text-sm text-admin-muted hover:text-night-text hover:underline">
        ← К списку событий
      </a>

      <div className="overflow-hidden rounded-app border border-admin-border bg-admin-card">
        <div className="flex items-center justify-between border-b border-admin-border px-5 py-3.5">
          <h1 className="m-0 font-night text-base font-extrabold uppercase tracking-wide text-night-text">
            {draft.id ? "Редактирование события" : "Создание события"}
          </h1>
          <div className="flex items-center gap-2.5">
            {saving !== "draft" && lastSavedAt && (
              <span className="text-xs text-admin-muted">Сохранено в {formatEventTime(lastSavedAt)}</span>
            )}
            <Button type="button" variant="adminOutline" size="sm" disabled={!canSaveDraft || saving !== null} onClick={() => save("DRAFT")}>
              {saving === "draft" ? "Сохраняем…" : "Сохранить черновик"}
            </Button>
          </div>
        </div>

        <div className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <WizardNav steps={steps} currentIndex={stepIndex} doneMap={doneMap} onSelect={setStepIndex} />
            </div>
            {stepNavButtons}
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[220px_1fr_320px]">
            <EventTypeSelector
              value={draft.format}
              onChange={(format) => {
                // Подтверждение при смене формата (2026-09-16, по итогам UX-ревью) —
                // раньше клик тут же тихо сбрасывал шаг на первый и менял набор
                // шагов, даже если организатор уже успел заполнить несколько
                // экранов. hasProgress — грубая, но дешёвая эвристика: реальный
                // прогресс либо уже сдвинул шаг вперёд, либо есть название.
                if (format !== draft.format) {
                  const hasProgress = stepIndex > 0 || draft.title.trim().length > 0;
                  if (
                    hasProgress &&
                    !window.confirm(
                      "Сменить тип события? Мастер вернётся на первый шаг, а набор шагов ниже изменится под новый формат. Уже введённые данные (название, дата и т.д.) не пропадут, но часть заполненных шагов может стать неактуальной."
                    )
                  ) {
                    return;
                  }
                }
                patch({ format });
                setStepIndex(0);
              }}
            />
            <div className="min-w-0">{renderStep(currentStep)}</div>
            {previewSidebar}
          </div>
        </div>

        {successMessage && (
          <p className="m-0 border-t border-admin-border bg-admin-primary/10 px-5 py-2.5 text-sm text-night-text">✓ {successMessage}</p>
        )}
        {error && <p className="m-0 border-t border-admin-border px-5 py-2.5 text-sm text-red-400">{error}</p>}

        <div className="flex items-center justify-between border-t border-admin-border px-5 py-3.5">
          <Button
            type="button"
            variant="adminOutline"
            size="sm"
            disabled={stepIndex === 0}
            onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
          >
            ← Назад
          </Button>
          {currentStep !== "publish" && currentStep !== "recurrence" && (
            <Button
              type="button"
              variant="admin"
              size="sm"
              onClick={() => setStepIndex((i) => Math.min(steps.length - 1, i + 1))}
            >
              Далее →
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
