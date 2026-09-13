import Image from "next/image";
import type { EventFormat, DanceLevel } from "@prisma/client";
import { t } from "@/lib/i18n/dictionary";
import { formatEventDate, formatEventTime, formatRelativeDayLabel } from "@/lib/format";
import { CalendarIcon, PinIcon, TicketIcon } from "./Icon";
import { Card } from "@/components/ui/card";
import { Tag } from "@/components/ui/tag";
import { buttonVariants } from "@/components/ui/button";
import { FORMAT_EMOJI } from "./EventCard";
import { cn } from "@/lib/cn";

export type EventCardPreviewData = {
  title: string;
  format: EventFormat;
  level: DanceLevel;
  // "YYYY-MM-DDTHH:mm" (тот же формат, что отдаёт DateTimeField) или "" —
  // ещё не выбрано.
  startsAt: string;
  cityName: string;
  organizerLabel: string;
  photoUrl: string;
  price: string | null;
};

// Живой предпросмотр карточки события прямо в форме создания (2026-09-12, по
// прямому запросу пользователя) — та же вёрстка, что и у настоящей
// EventCard.tsx (карточка, которую увидят на /events), но не кликабельная
// (события ещё не существует — нет slug, вести некуда) и терпимая к пустым/
// невалидным ещё не заполненным полям, вместо того чтобы падать на
// невалидной дате. Источник истины для самого события остаётся сервер
// (CLAUDE.md §19) — это только визуальная подсказка организатору, как оно
// будет выглядеть, ничего не сохраняет и не считает самостоятельно.
export function EventCardPreview({ data }: { data: EventCardPreviewData }) {
  const parsedDate = data.startsAt ? new Date(data.startsAt) : null;
  const validDate = parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : null;
  const relativeDay = validDate ? formatRelativeDayLabel(validDate) : null;

  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 text-xs font-semibold uppercase tracking-wide text-admin-muted">Так это увидят на сайте</p>
      <Card className="flex flex-col overflow-hidden border-night-border bg-night-card p-0">
        <div className="relative flex aspect-video items-center justify-center overflow-hidden bg-gradient-night-hero text-4xl">
          {data.photoUrl ? (
            <Image src={data.photoUrl} alt="" fill sizes="360px" className="object-cover" />
          ) : (
            <span aria-hidden="true">{FORMAT_EMOJI[data.format]}</span>
          )}
          {relativeDay && (
            <span className="absolute right-2.5 top-2.5 rounded-full bg-black/60 px-3 py-1 text-[0.72rem] font-bold uppercase tracking-wide text-white backdrop-blur-sm">
              {relativeDay}
            </span>
          )}
        </div>

        <div className="flex flex-1 flex-col p-[18px] pt-3.5">
          <p className="m-0">
            <Tag className="bg-night-card2 text-night-pink">{t.event.formats[data.format]}</Tag>
            <Tag className="bg-night-card2 text-night-pink">{t.event.levels[data.level]}</Tag>
          </p>
          <h3 className="my-2 mb-1.5">
            <span className="text-night-text">{data.title || "Название события"}</span>
          </h3>

          <div className="mt-1 flex items-center gap-1.5 text-[0.87rem] text-night-muted [&_svg]:shrink-0 [&_svg]:text-night-primary">
            <CalendarIcon />
            <span>{validDate ? `${formatEventDate(validDate)}, ${formatEventTime(validDate)}` : "Дата и время не выбраны"}</span>
          </div>
          <div className="mb-3 mt-1 flex items-center gap-1.5 text-[0.87rem] text-night-muted [&_svg]:shrink-0 [&_svg]:text-night-primary">
            <PinIcon />
            <span>
              {data.cityName || "Город не выбран"}
              {data.organizerLabel ? ` · ${data.organizerLabel}` : ""}
            </span>
          </div>
          {data.price && (
            <div className="mb-3 mt-1 flex items-center gap-1.5 text-[0.87rem] text-night-pink [&_svg]:shrink-0">
              <TicketIcon />
              <span>{data.price}</span>
            </div>
          )}

          <span
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "pointer-events-none mt-auto self-start border-night-border bg-transparent text-night-text"
            )}
          >
            {t.common.details} »
          </span>
        </div>
      </Card>
    </div>
  );
}
