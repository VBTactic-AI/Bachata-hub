import Link from "next/link";
import type { CompetitionStatus } from "@prisma/client";

export type CompetitionCardData = {
  id: string;
  name: string;
  startAt: Date | null;
  venue: string | null;
  cityName: string | null;
  status: CompetitionStatus;
  coverUrl: string | null;
  isRegistered: boolean;
};

const DATE_FMT = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });

function StatusPill({ status, isRegistered }: { status: CompetitionStatus; isRegistered: boolean }) {
  if (isRegistered) {
    return (
      <span className="shrink-0 rounded-full bg-night-success/15 px-2.5 py-1 text-[0.7rem] font-semibold text-night-success">
        Вы зарегистрированы
      </span>
    );
  }
  if (status !== "REGISTRATION_OPEN") {
    return (
      <span className="shrink-0 rounded-full bg-night-card2 px-2.5 py-1 text-[0.7rem] font-semibold text-night-disabled">
        Регистрация закрыта
      </span>
    );
  }
  return (
    <span className="shrink-0 rounded-full bg-gradient-night-cta px-2.5 py-1 text-[0.7rem] font-semibold text-white">Регистрация</span>
  );
}

// Компактная карточка списка (по референсу пользователя, 2026-09-04) — вся
// карточка целиком ведёт на страницу соревнования, статус-пилюля справа не
// отдельная ссылка (вложенные <a> невалидны), просто индикатор.
export function CompetitionCard({ competition }: { competition: CompetitionCardData }) {
  const { id, name, startAt, venue, cityName, status, coverUrl, isRegistered } = competition;
  const place = [cityName, venue].filter(Boolean).join(", ");

  return (
    <Link
      href={`/compete/${id}`}
      className="flex items-center gap-3 rounded-app border border-night-border bg-night-card p-2.5 no-underline transition-transform active:scale-[0.98] hover:border-night-primary/60"
    >
      <div
        className="h-16 w-16 shrink-0 rounded-app-sm bg-gradient-night-hero bg-cover bg-center"
        style={coverUrl ? { backgroundImage: `url(${coverUrl})` } : undefined}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="m-0 line-clamp-2 font-night text-[0.95rem] font-bold leading-snug text-night-text">{name}</p>
        {place && <p className="m-0 mt-0.5 truncate text-[0.8rem] text-night-muted">{place}</p>}
        {startAt && <p className="m-0 text-[0.8rem] text-night-muted">{DATE_FMT.format(startAt)}</p>}
      </div>
      <StatusPill status={status} isRegistered={isRegistered} />
    </Link>
  );
}
