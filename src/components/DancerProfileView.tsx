import Link from "next/link";
import { t } from "@/lib/i18n/dictionary";
import { formatDateTime } from "@/lib/format";
import type { getDancerProfile } from "@/lib/dancer";
import { AchievementItem } from "./AchievementItem";

type Dancer = NonNullable<Awaited<ReturnType<typeof getDancerProfile>>>;

// editable=true только на собственной странице профиля (/profile) — на
// публичной странице танцора (/dancers/[id]) редактировать/удалять чужие
// достижения нельзя, поэтому проп там не передаётся (по умолчанию false).
export function DancerProfileView({ dancer, editable = false }: { dancer: Dancer; editable?: boolean }) {
  const going = dancer.attendances.filter((a) => a.status === "GOING");
  const went = dancer.attendances.filter((a) => a.status === "WENT");
  const attendedEvents = went.map((a) => a.event);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-4">
        {dancer.avatarUrl ? (
          <img
            src={dancer.avatarUrl}
            alt={dancer.displayName}
            width={80}
            height={80}
            className="rounded-full object-cover"
          />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-night-card2 text-[28px] font-bold text-night-muted">
            {dancer.displayName.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div>
          <h1 className="m-0 font-night text-xl font-extrabold text-night-text">{dancer.displayName}</h1>
          <p className="m-0 mt-1 text-sm text-night-muted">
            {[dancer.city?.nameRu, dancer.danceRole ? t.dancer.role[dancer.danceRole] : null, dancer.selfLevel ? t.event.levels[dancer.selfLevel] : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </div>

      <div>
        <h2 className="m-0 mb-2 font-night text-base font-bold text-night-text">{t.dancer.achievements}</h2>
        {dancer.achievements.length === 0 ? (
          <p className="text-sm text-night-muted">{t.dancer.achievementsEmpty}</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {dancer.achievements.map((a) => (
              <AchievementItem key={a.id} achievement={a} attendedEvents={attendedEvents} editable={editable} />
            ))}
          </ul>
        )}
      </div>

      <div>
        <h2 className="m-0 mb-1 font-night text-base font-bold text-night-text">{t.dancer.history}</h2>
        <p className="m-0 mb-2 text-sm text-night-muted">{t.dancer.historyNote}</p>

        {going.length > 0 && (
          <>
            <h3 className="m-0 mb-1 mt-3 text-sm font-semibold text-night-text">{t.event.imGoing}</h3>
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-sm text-night-text">
              {going.map((a) => (
                <li key={a.id}>
                  <Link href={`/events/${a.event.slug}`} className="text-night-primary">
                    {a.event.title}
                  </Link>{" "}
                  <span className="text-night-muted">— {formatDateTime(a.event.startsAt)}, {a.event.city.nameRu}</span>
                </li>
              ))}
            </ul>
          </>
        )}

        {went.length > 0 ? (
          <>
            <h3 className="m-0 mb-1 mt-3 text-sm font-semibold text-night-text">{t.event.iWent}</h3>
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-sm text-night-text">
              {went.map((a) => (
                <li key={a.id}>
                  <Link href={`/events/${a.event.slug}`} className="text-night-primary">
                    {a.event.title}
                  </Link>{" "}
                  <span className="text-night-muted">— {formatDateTime(a.event.startsAt)}, {a.event.city.nameRu}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          going.length === 0 && <p className="text-sm text-night-muted">{t.dancer.noAttendanceMarks}</p>
        )}
      </div>
    </div>
  );
}
