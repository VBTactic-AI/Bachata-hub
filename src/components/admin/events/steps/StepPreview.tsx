"use client";

import Link from "next/link";
import { EventCardPreview } from "@/components/EventCardPreview";
import { formatEventCardPrice } from "@/lib/event-price";
import type { WizardDraft } from "../wizard-types";

// STEP "Preview" — задача явно требует НЕ отдельный примитивный предпросмотр,
// а тот же рендерер, что видит посетитель сайта ("Admin Event Editor -> Event
// data -> Public Event Renderer"). EventCardPreview — уже существующий живой
// предпросмотр карточки (коммит 2026-09-12), переиспользуется как есть; когда
// черновик уже сохранён (есть slug), ниже — прямая ссылка на настоящую
// публичную страницу /events/[slug] (автор видит её даже до публикации/
// модерации — см. правку в src/app/events/[slug]/page.tsx).
export function StepPreview({
  draft,
  cityName,
  organizerLabel,
  slug,
}: {
  draft: WizardDraft;
  cityName: string;
  organizerLabel: string;
  slug: string | null;
}) {
  const mainImage = draft.media.find((m) => m.isMain);
  const price = formatEventCardPrice(
    draft.priceText || null,
    draft.priceOptions.filter((o) => o.price).map((o) => ({ price: Number(o.price), currency: o.currency || null }))
  );
  return (
    <div className="flex flex-col gap-4">
      <h2 className="m-0 font-night text-lg font-bold text-night-text">Предпросмотр</h2>

      <div className="max-w-[360px]">
        <EventCardPreview
          data={{
            title: draft.title,
            format: draft.format,
            level: draft.level,
            startsAt: draft.startsAt,
            cityName,
            organizerLabel,
            photoUrl: mainImage?.url ?? "",
            price,
          }}
        />
      </div>

      {slug ? (
        <Link href={`/events/${slug}`} target="_blank" className="text-sm text-admin-primary hover:underline">
          Открыть настоящую публичную страницу →
        </Link>
      ) : (
        <p className="m-0 text-sm text-admin-muted">Сохраните черновик, чтобы открыть настоящую публичную страницу.</p>
      )}
    </div>
  );
}
