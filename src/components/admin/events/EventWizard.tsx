"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { EventFormat, EventStatus, ModerationStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import {
  EVENT_TYPE_REGISTRY,
  computePublishChecklist,
  isChecklistComplete,
  type EventStepId,
} from "@/lib/events/event-type-registry";
import { WizardNav } from "./WizardNav";
import { StepType } from "./steps/StepType";
import { StepBasic } from "./steps/StepBasic";
import { StepLocation } from "./steps/StepLocation";
import { StepDateTime } from "./steps/StepDateTime";
import { StepPartyDetails } from "./steps/StepPartyDetails";
import { StepSessions } from "./steps/StepSessions";
import { StepMasterclassDetails } from "./steps/StepMasterclassDetails";
import { StepTickets } from "./steps/StepTickets";
import { StepPreview } from "./steps/StepPreview";
import { StepPublish } from "./steps/StepPublish";
import { toApiPayload, type WizardDraft } from "./wizard-types";

export type MyEventListItem = {
  id: string;
  slug: string;
  title: string;
  format: EventFormat;
  status: EventStatus;
  moderationStatus: ModerationStatus;
};

function myEventStatusLabel(status: EventStatus, moderationStatus: ModerationStatus): string {
  if (status === "DRAFT") return "Черновик";
  if (status === "ARCHIVED") return "В архиве";
  if (moderationStatus === "APPROVED") return "Опубликовано";
  if (moderationStatus === "REJECTED") return "Отклонено модератором";
  return "На модерации";
}

// Event Engine — единый Create Event Wizard (задача "ОБЩИЙ CREATE EVENT
// ENGINE"): один компонент управляет состоянием черновика и навигацией,
// набор шагов приходит из EVENT_TYPE_REGISTRY (src/lib/events/
// event-type-registry.ts) по текущему draft.format — никаких if(type===...)
// в отдельных шагах, только ОДНА диспетчеризация step-id -> компонент, здесь.
export function EventWizard({
  cities,
  ownedSchools,
  teachers,
  canCreateCompetition,
  initialDraft,
  myEvents,
}: {
  cities: { id: string; nameRu: string }[];
  ownedSchools: { id: string; name: string; verificationStatus: "COMMUNITY" | "VERIFIED" }[];
  teachers: { id: string; name: string }[];
  canCreateCompetition: boolean;
  initialDraft: WizardDraft;
  myEvents: MyEventListItem[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<WizardDraft>(initialDraft);
  const [stepIndex, setStepIndex] = useState(0);
  const [saving, setSaving] = useState<"draft" | "publish" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const config = EVENT_TYPE_REGISTRY[draft.format];
  const steps = config.steps;
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
    type: true,
    basic: !!checklistById.title,
    location: !!(checklistById.city && checklistById.venue),
    datetime: !!checklistById.startsAt,
    sessions: !!(checklistById.sessions && checklistById.instructor),
    partyDetails: true,
    details: true,
    tickets: true,
    preview: true,
    publish: complete,
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
        setError(body?.error === "publish_incomplete" ? "Заполните обязательные поля." : "Не удалось сохранить событие.");
        return;
      }
      setDraft((d) => ({
        ...d,
        id: body.event.id,
        slug: body.event.slug,
        status: body.event.status,
        competitionId: body.competitionId ?? d.competitionId,
      }));
      if (status === "PUBLISHED") {
        // Задача: после публикации показать понятное сообщение
        // (опубликовано / на модерации) и перекинуть на карточку события,
        // чтобы организатор сразу проверил, всё ли заполнено верно.
        const approved = body.event.moderationStatus === "APPROVED";
        setSuccessMessage(approved ? "Событие опубликовано! Открываем карточку…" : "Событие отправлено на модерацию. Открываем карточку…");
        setTimeout(() => router.push(`/events/${body.event.slug}`), 1400);
      }
    } catch {
      setError("Не удалось сохранить событие — проверьте соединение.");
    } finally {
      setSaving(null);
    }
  }

  const selectedSchool = ownedSchools.find((s) => s.id === draft.schoolId);
  const willAutoApprove = !!(selectedSchool && selectedSchool.verificationStatus === "VERIFIED");
  const cityName = cities.find((c) => c.id === draft.cityId)?.nameRu ?? "";
  const organizerLabel = selectedSchool?.name ?? draft.organizerName;

  function renderStep(step: EventStepId) {
    switch (step) {
      case "type":
        return (
          <StepType
            value={draft.format}
            onChange={(format) => patch({ format })}
            canCreateCompetition={canCreateCompetition}
          />
        );
      case "basic":
        return <StepBasic draft={draft} onChange={patch} />;
      case "location":
        return <StepLocation draft={draft} onChange={patch} cities={cities} ownedSchools={ownedSchools} />;
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
      case "preview":
        return (
          <StepPreview
            draft={draft}
            cityName={cityName}
            organizerLabel={organizerLabel}
            slug={draft.slug ?? null}
          />
        );
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
          />
        );
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {myEvents.length > 0 && !draft.id && (
        <div className="rounded-app border border-admin-border bg-admin-card px-4 py-3 text-sm">
          <p className="m-0 mb-2 font-semibold text-night-text">Мои события</p>
          <div className="flex flex-col gap-1.5">
            {myEvents.map((e) => (
              <div key={e.id} className="flex flex-wrap items-center gap-2">
                <a href={`/admin/content?draft=${e.id}`} className="text-admin-primary hover:underline">
                  {e.title || "Без названия"}
                </a>
                <span className="text-xs text-admin-muted">
                  {EVENT_TYPE_REGISTRY[e.format].label} · {myEventStatusLabel(e.status, e.moderationStatus)}
                </span>
                {e.status === "PUBLISHED" && e.moderationStatus === "APPROVED" && (
                  <a href={`/events/${e.slug}`} target="_blank" className="text-xs text-admin-muted hover:text-night-text hover:underline">
                    Открыть карточку →
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-app border border-admin-border bg-admin-card">
        <div className="flex items-center justify-between border-b border-admin-border px-5 py-3.5">
          <h1 className="m-0 font-night text-base font-extrabold uppercase tracking-wide text-night-text">Создание события</h1>
          <Button type="button" variant="adminOutline" size="sm" disabled={!canSaveDraft || saving !== null} onClick={() => save("DRAFT")}>
            {saving === "draft" ? "…" : "Сохранить черновик"}
          </Button>
        </div>

        <div className="flex flex-col gap-5 p-5 sm:flex-row">
          <WizardNav steps={steps} currentIndex={stepIndex} doneMap={doneMap} onSelect={setStepIndex} />
          <div className="min-w-0 flex-1">{renderStep(currentStep)}</div>
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
          {currentStep !== "publish" && (
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
