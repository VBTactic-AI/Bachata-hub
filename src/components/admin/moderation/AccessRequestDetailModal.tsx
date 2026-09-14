"use client";

import type { ReactNode } from "react";
import { t } from "@/lib/i18n/dictionary";
import { Tag } from "@/components/ui/tag";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { DetailModal } from "./DetailModal";

export type AccessRequestDetail = {
  id: string;
  brandName: string;
  description: string;
  cityName: string | null;
  countryName: string | null;
  applicantEmail: string;
  phone: string | null;
  links: { type: string; url: string }[];
  // Специфичные для SCHOOL_HEAD поля payload — этот модал сегодня
  // используется только на /admin/moderation/schools (см. страницу), для
  // остальных 3 типов будет отдельная страница /admin/moderation/organizer-requests.
  teachingStyles: string[];
  teachersCount: string;
  hasRegularClasses: boolean;
  status: "PENDING" | "NEEDS_INFO" | "APPROVED" | "REJECTED" | "REVOKED";
  createdAt: string; // ISO
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="m-0 text-[10.5px] font-bold uppercase tracking-wide text-admin-disabled">{label}</p>
      <div className="mt-0.5 text-sm text-night-text">{children}</div>
    </div>
  );
}

// Полная карточка заявки "Руководитель школы" (заменяет SchoolClaimDetailModal
// — та работала с моделью SchoolClaim, которая удалена, см.
// docs/00_DECISIONS.md 2026-09-14) — показывает всё, что заявитель указал в
// анкете /become-organizer, чтобы решение принималось по полной картине.
export function AccessRequestDetailModal({
  request,
  actions,
  trigger,
}: {
  request: AccessRequestDetail;
  actions: ReactNode;
  trigger: ReactNode;
}) {
  return (
    <DetailModal trigger={trigger} title={request.brandName}>
      <div className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge
            label={request.status === "NEEDS_INFO" ? "Нужна информация" : request.status}
            variant={request.status === "NEEDS_INFO" ? "warning" : "neutral"}
          />
        </div>

        {(request.cityName || request.countryName) && (
          <Field label={t.event.city}>{[request.cityName, request.countryName].filter(Boolean).join(", ")}</Field>
        )}

        <Field label={t.event.description}>{request.description}</Field>

        {request.teachingStyles.length > 0 && (
          <Field label="Направления">
            {request.teachingStyles.map((d) => (
              <Tag key={d} className="border border-admin-border bg-admin-card2 text-night-text">
                {d}
              </Tag>
            ))}
          </Field>
        )}

        <Field label="Преподавателей">{request.teachersCount}</Field>
        <Field label="Регулярные занятия">{request.hasRegularClasses ? "Да" : "Нет"}</Field>

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
