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
  divisionNames: string[];
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

// Две вёрстки одной карточки (по референсу пользователя, 2026-09-04; десктоп
// — по макету JBJ Platform, найдено пользователем 07.09.2026: раньше на
// десктопе рендерилась та же компактная строка, что и на мобильном) — вся
// карточка целиком ведёт на страницу соревнования, статус-пилюля справа не
// отдельная ссылка (вложенные <a> невалидны), просто индикатор.
export function CompetitionCard({ competition }: { competition: CompetitionCardData }) {
  const { id, name, startAt, venue, cityName, status, coverUrl, isRegistered, divisionNames } = competition;
  const place = [cityName, venue].filter(Boolean).join(", ");
  const cover = (
    <div
      className="bg-gradient-night-hero bg-cover bg-center"
      style={coverUrl ? { backgroundImage: `url(${coverUrl})` } : undefined}
      aria-hidden="true"
    />
  );

  return (
    <>
      {/* Мобильный/планшетный вариант — компактная строка */}
      <Link
        href={`/compete/${id}`}
        className="flex items-center gap-3 rounded-app border border-night-border bg-night-card p-2.5 no-underline transition-transform active:scale-[0.98] hover:border-night-primary/60 sm:hidden"
      >
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-app-sm">{cover}</div>
        <div className="min-w-0 flex-1">
          <p className="m-0 line-clamp-2 font-night text-[0.95rem] font-bold leading-snug text-night-text">{name}</p>
          {place && <p className="m-0 mt-0.5 truncate text-[0.8rem] text-night-muted">{place}</p>}
          {startAt && <p className="m-0 text-[0.8rem] text-night-muted">{DATE_FMT.format(startAt)}</p>}
        </div>
        <StatusPill status={status} isRegistered={isRegistered} />
      </Link>

      {/* Десктопный вариант — карточка с картинкой сверху, как в макете JBJ Platform */}
      <Link
        href={`/compete/${id}`}
        className="hidden flex-col overflow-hidden rounded-app border border-night-border bg-night-card no-underline transition-colors hover:border-night-primary/60 hover:bg-night-card2 sm:flex"
      >
        <div className="h-[150px] w-full">{cover}</div>
        <div className="flex flex-col gap-2 p-5">
          <div className="flex items-start justify-between gap-2">
            <p className="m-0 font-night text-[1.05rem] font-semibold leading-snug text-night-text">{name}</p>
            <StatusPill status={status} isRegistered={isRegistered} />
          </div>
          {startAt && <p className="m-0 text-sm font-medium text-night-primary">{DATE_FMT.format(startAt)}</p>}
          {place && <p className="m-0 text-xs text-night-muted">{place}</p>}
          {divisionNames.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1.5">
              {divisionNames.map((d) => (
                <span
                  key={d}
                  className="rounded-full border border-night-border px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-wide text-night-muted"
                >
                  {d}
                </span>
              ))}
            </div>
          )}
        </div>
      </Link>
    </>
  );
}
