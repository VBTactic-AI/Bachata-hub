import type { CompetitionStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { COMPETITION_STATUS_LABELS as STATUS_LABELS } from "@/lib/competition-labels";

function formatDate(d: Date | null): string | null {
  if (!d) return null;
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(d);
}

// Шапка страницы соревнования (redesign, 2026-09-08) — раньше название и
// статус были обычным <h1>/<p> в самом начале длинного скролла. Показывает
// только то, что реально есть в модели (название/статус/дата/город/площадка)
// — референс рисует ещё кнопки "Редактировать"/"Экспорт", но ни редактирования
// соревнования (кроме публичной инфы, см. Настройки), ни экспорта в проекте
// не существует, поэтому здесь их нет (не изображаем нерабочие кнопки).
export function CompetitionHeader({
  name,
  status,
  cityName,
  venue,
  startAt,
}: {
  name: string;
  status: CompetitionStatus;
  cityName: string | null;
  venue: string | null;
  startAt: Date | null;
}) {
  const dateLabel = formatDate(startAt);
  const metaParts = [dateLabel, cityName, venue].filter(Boolean);

  return (
    <div className="flex flex-col gap-1.5">
      <h1 className="m-0 font-night text-xl font-extrabold text-night-text sm:text-2xl">{name}</h1>
      <div className="flex flex-wrap items-center gap-2 text-sm text-night-muted">
        <Badge variant="community" className="bg-admin-primary/15 text-admin-primaryHover">
          {STATUS_LABELS[status] ?? status}
        </Badge>
        {metaParts.length > 0 && <span>{metaParts.join(" · ")}</span>}
      </div>
    </div>
  );
}
