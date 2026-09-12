"use client";

import type { ReactNode } from "react";
import { t } from "@/lib/i18n/dictionary";
import { formatDateTime } from "@/lib/format";
import { Tag } from "@/components/ui/tag";
import { DetailModal } from "./DetailModal";

export type ModerationEventDetail = {
  id: string;
  title: string;
  format: keyof typeof t.event.formats;
  level: keyof typeof t.event.levels;
  startsAt: string; // ISO
  endsAt: string | null;
  cityName: string;
  venueName: string;
  venueAddress: string | null;
  description: string | null;
  photoUrl: string | null;
  priceText: string | null;
  externalLinkUrl: string | null;
  tags: string[];
  schoolName: string | null;
  organizerName: string | null;
  createdByEmail: string;
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

// Полная карточка события на модерации (клик по строке в /admin/moderation/
// events, 2026-09-12, по прямому запросу пользователя) — та же информация,
// что видит посетитель на публичной странице события, плюс служебные поля
// (кто добавил, когда), которых на публичной странице нет и быть не должно.
export function EventDetailModal({ event, actions, trigger }: { event: ModerationEventDetail; actions: ReactNode; trigger: ReactNode }) {
  return (
    <DetailModal trigger={trigger} title={event.title}>
      <div className="flex flex-col gap-3.5">
        {event.photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.photoUrl} alt="" className="max-h-[220px] w-full rounded-app-sm object-cover" />
        )}

        <div className="flex flex-wrap gap-1.5">
          <Tag className="border border-admin-border bg-admin-card2 text-night-text">{t.event.formats[event.format]}</Tag>
          <Tag className="border border-admin-border bg-admin-card2 text-night-text">{t.event.levels[event.level]}</Tag>
        </div>

        <Field label={t.event.date}>
          {formatDateTime(new Date(event.startsAt))}
          {event.endsAt ? ` — ${formatDateTime(new Date(event.endsAt))}` : ""}
        </Field>

        <Field label={t.event.place}>
          {event.cityName} · {event.venueName}
          {event.venueAddress ? `, ${event.venueAddress}` : ""}
        </Field>

        <Field label={t.event.organizer}>{event.schoolName ?? event.organizerName ?? "—"}</Field>

        {event.description && <Field label={t.event.description}>{event.description}</Field>}

        {event.priceText && <Field label={t.event.price}>{event.priceText}</Field>}

        {event.externalLinkUrl && (
          <Field label={t.event.registerExternal}>
            <a href={event.externalLinkUrl} target="_blank" rel="noreferrer" className="text-admin-primaryHover">
              {event.externalLinkUrl}
            </a>
          </Field>
        )}

        {event.tags.length > 0 && (
          <Field label={t.event.tags}>
            {event.tags.map((tag) => (
              <Tag key={tag} className="border border-admin-border bg-admin-card2 text-night-text">
                {tag}
              </Tag>
            ))}
          </Field>
        )}

        <Field label="Добавил(а)">
          {event.createdByEmail} · {formatDateTime(new Date(event.createdAt))}
        </Field>

        <div className="border-t border-admin-border pt-3.5">{actions}</div>
      </div>
    </DetailModal>
  );
}
