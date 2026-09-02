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
    <div className="stack">
      <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
        {dancer.avatarUrl ? (
          <img
            src={dancer.avatarUrl}
            alt={dancer.displayName}
            width={80}
            height={80}
            style={{ borderRadius: "50%", objectFit: "cover" }}
          />
        ) : (
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: "50%",
              background: "var(--color-border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 28,
              fontWeight: 700,
              color: "var(--color-text-muted)",
            }}
          >
            {dancer.displayName.slice(0, 1).toUpperCase()}
          </div>
        )}
        <div>
          <h1 className="page-title">{dancer.displayName}</h1>
          <p className="hint-text" style={{ margin: 0 }}>
            {[dancer.city?.nameRu, dancer.danceRole ? t.dancer.role[dancer.danceRole] : null, dancer.selfLevel ? t.event.levels[dancer.selfLevel] : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </div>

      <div>
        <h2 className="page-title">{t.dancer.achievements}</h2>
        {dancer.achievements.length === 0 ? (
          <p className="hint-text">{t.dancer.achievementsEmpty}</p>
        ) : (
          <ul>
            {dancer.achievements.map((a) => (
              <AchievementItem key={a.id} achievement={a} attendedEvents={attendedEvents} editable={editable} />
            ))}
          </ul>
        )}
      </div>

      <div>
        <h2 className="page-title">{t.dancer.history}</h2>
        <p className="hint-text">{t.dancer.historyNote}</p>

        {going.length > 0 && (
          <>
            <h3>{t.event.imGoing}</h3>
            <ul>
              {going.map((a) => (
                <li key={a.id}>
                  <Link href={`/events/${a.event.slug}`}>{a.event.title}</Link>{" "}
                  <span className="hint-text">— {formatDateTime(a.event.startsAt)}, {a.event.city.nameRu}</span>
                </li>
              ))}
            </ul>
          </>
        )}

        {went.length > 0 ? (
          <>
            <h3>{t.event.iWent}</h3>
            <ul>
              {went.map((a) => (
                <li key={a.id}>
                  <Link href={`/events/${a.event.slug}`}>{a.event.title}</Link>{" "}
                  <span className="hint-text">— {formatDateTime(a.event.startsAt)}, {a.event.city.nameRu}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          going.length === 0 && <p className="hint-text">{t.dancer.noAttendanceMarks}</p>
        )}
      </div>
    </div>
  );
}
