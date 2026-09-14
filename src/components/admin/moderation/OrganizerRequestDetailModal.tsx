"use client";

import type { ReactNode } from "react";
import { t } from "@/lib/i18n/dictionary";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { DetailModal } from "./DetailModal";
import type { AccessRequestStatus, AccessRequestType } from "@prisma/client";

const TYPE_LABELS: Record<AccessRequestType, string> = {
  EVENT_ORGANIZER: "Организатор мероприятий",
  FESTIVAL_ORGANIZER: "Организатор фестиваля",
  SCHOOL_HEAD: "Руководитель школы",
  COMPETITION_ORGANIZER: "Организатор соревнований",
};

// Только эти два ключа payload когда-либо содержат ссылку на реально
// созданную сущность (см. src/server/access-requests/review.ts) — их не
// показываем сырыми, они не для человека.
const HIDDEN_PAYLOAD_KEYS = new Set(["resolvedSchoolId"]);

const PAYLOAD_FIELD_LABELS: Record<string, string> = {
  eventTypes: "Виды мероприятий",
  experience: "Опыт",
  exampleUrl: "Пример",
  festivalName: "Название фестиваля",
  url: "Ссылка",
  frequency: "Периодичность",
  scale: "Масштаб",
  formats: "Форматы",
  pastFestivalUrl: "Прошлый фестиваль",
};

function renderPayloadValue(v: unknown): string {
  if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
  if (typeof v === "boolean") return v ? "Да" : "Нет";
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="m-0 text-[10.5px] font-bold uppercase tracking-wide text-admin-disabled">{label}</p>
      <div className="mt-0.5 text-sm text-night-text">{children}</div>
    </div>
  );
}

export type OrganizerRequestDetail = {
  id: string;
  type: AccessRequestType;
  brandName: string;
  description: string;
  cityName: string | null;
  countryName: string | null;
  applicantEmail: string;
  phone: string | null;
  links: { type: string; url: string }[];
  payload: Record<string, unknown>;
  status: AccessRequestStatus;
  createdAt: string; // ISO
};

// Общая карточка заявки для трёх "организаторских" типов (EVENT_ORGANIZER/
// FESTIVAL_ORGANIZER/COMPETITION_ORGANIZER) — SCHOOL_HEAD показывается
// отдельным AccessRequestDetailModal (свой набор полей, унаследован от
// прежнего SchoolClaimDetailModal). Payload рендерится по общей карте
// подписей, не отдельным блоком на каждый тип — оправдано тем, что это
// внутренний экран для администратора, не публичная форма.
export function OrganizerRequestDetailModal({
  request,
  actions,
  trigger,
}: {
  request: OrganizerRequestDetail;
  actions: ReactNode;
  trigger: ReactNode;
}) {
  const payloadEntries = Object.entries(request.payload).filter(([k]) => !HIDDEN_PAYLOAD_KEYS.has(k));

  return (
    <DetailModal trigger={trigger} title={`${TYPE_LABELS[request.type]} — ${request.brandName}`}>
      <div className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge label={request.status === "NEEDS_INFO" ? "Нужна информация" : request.status} variant={request.status === "NEEDS_INFO" ? "warning" : "neutral"} />
        </div>

        {(request.cityName || request.countryName) && (
          <Field label={t.event.city}>{[request.cityName, request.countryName].filter(Boolean).join(", ")}</Field>
        )}

        <Field label={t.event.description}>{request.description}</Field>

        {payloadEntries.map(([key, value]) => (
          <Field key={key} label={PAYLOAD_FIELD_LABELS[key] ?? key}>
            {renderPayloadValue(value)}
          </Field>
        ))}

        {request.links.length > 0 && (
          <Field label="Ссылки">
            <div className="flex flex-col gap-0.5">
              {request.links.map((l) => (
                <a key={l.url} href={l.url} target="_blank" rel="noreferrer" className="text-admin-primary underline">
                  {l.url}
                </a>
              ))}
            </div>
          </Field>
        )}

        <div className="border-t border-admin-border pt-3.5">
          <Field label="Заявитель">{[request.applicantEmail, request.phone].filter(Boolean).join(" · ")}</Field>
        </div>

        <Field label={t.moderation.submittedAt}>{new Date(request.createdAt).toLocaleString("ru-RU")}</Field>

        <div className="border-t border-admin-border pt-3.5">{actions}</div>
      </div>
    </DetailModal>
  );
}
