"use client";

import Link from "next/link";
import { EventCardPreview } from "@/components/EventCardPreview";
import { formatEventCardPrice } from "@/lib/event-price";
import type { WizardDraft } from "./wizard-types";

// Живой предпросмотр (редизайн 2026-09-16, по прямому запросу пользователя,
// макет согласован заранее) — раньше был отдельным шагом "Предпросмотр" в
// конце мастера, теперь постоянно видимая боковая панель НА КАЖДОМ шаге
// (карточка и так показывает, как событие будет выглядеть — отдельный шаг
// ради этого же самого стал не нужен). Ссылка на настоящую публичную
// страницу — то, что раньше было единственным содержимым шага "Предпросмотр"
// кроме самой карточки — теперь просто строка под карточкой.
export function EventPreviewSidebar({
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

  const hasDate = !!draft.startsAt;
  const hasCity = !!draft.cityId;
  const hasTickets = draft.ticketingMode === "TICKETS" || draft.ticketingMode === "PASSES" || draft.ticketingMode === "TICKETS_AND_PASSES";

  return (
    <div className="flex flex-col gap-3">
      {/* EventCardPreview уже рендерит свою подпись "Так это увидят на
          сайте" внутри себя — второй раз здесь не дублируем. */}
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

      {slug ? (
        <Link href={`/events/${slug}`} target="_blank" className="text-center text-xs text-admin-primaryHover hover:underline">
          Открыть публичную страницу мероприятия →
        </Link>
      ) : (
        <p className="m-0 text-center text-xs text-admin-disabled">
          Сохраните черновик, чтобы открыть <span className="text-admin-muted">публичную страницу мероприятия</span>.
        </p>
      )}

      <div className="mt-1 flex flex-col gap-2.5 rounded-app-sm border border-admin-border bg-admin-card p-3.5">
        <ChecklistItem icon="📅" label="Дата и время" value={hasDate ? "Указано" : "Не указано — следующий шаг"} ok={hasDate} />
        <ChecklistItem icon="📍" label="Город" value={cityName || "Не указано"} ok={hasCity} />
        <ChecklistItem
          icon="🎫"
          label="Билеты"
          value={hasTickets ? "Настроено" : "Будет настроено на следующих шагах"}
          ok={hasTickets}
        />
      </div>

      <div className="flex gap-2 rounded-app-sm border border-admin-primary/25 bg-admin-primary/5 p-3 text-[11.5px] leading-relaxed text-[#a9c4f5]">
        <span aria-hidden="true">💡</span>
        <span>Черновик сохраняется по кнопке «Сохранить черновик» вверху — вернуться сюда можно в любой момент.</span>
      </div>
    </div>
  );
}

function ChecklistItem({ icon, label, value, ok }: { icon: string; label: string; value: string; ok: boolean }) {
  return (
    <div className="flex items-start gap-2.5 text-xs">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] border border-admin-border bg-admin-card2 text-admin-primaryHover">
        {icon}
      </span>
      <span>
        <span className="block font-semibold text-night-text">{label}</span>
        <span className={ok ? "text-night-success" : "text-admin-disabled"}>{value}</span>
      </span>
    </div>
  );
}
