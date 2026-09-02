import { redirect } from "next/navigation";
import { getCurrentUser, isModerator } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { t } from "@/lib/i18n/dictionary";
import { formatDateTime } from "@/lib/format";
import { ModerationActions } from "@/components/ModerationActions";

export default async function ModerationEventsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isModerator(user)) redirect("/");

  const events = await prisma.event.findMany({
    where: { moderationStatus: "PENDING" },
    include: { city: true, school: true, createdBy: true },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="stack">
      <h1 className="page-title">{t.moderation.events}</h1>
      {events.length === 0 ? (
        <p className="hint-text">{t.moderation.noPendingEvents}</p>
      ) : (
        <div className="stack" style={{ gap: 12 }}>
          {events.map((e) => (
            <div key={e.id} className="card">
              <strong>{e.title}</strong>
              <p className="hint-text" style={{ margin: "4px 0" }}>
                {formatDateTime(e.startsAt)} · {e.city.nameRu} · {e.venueName}
              </p>
              <p style={{ margin: 0 }}>
                {t.event.formats[e.format]} · {t.event.levels[e.level]}
              </p>
              <p className="hint-text" style={{ margin: "4px 0" }}>
                {t.event.organizer}: {e.school?.name ?? e.organizerName ?? "—"} · {e.createdBy.email}
              </p>
              {e.description && <p style={{ margin: "4px 0" }}>{e.description}</p>}
              <ModerationActions endpoint={`/api/moderation/events/${e.id}`} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
