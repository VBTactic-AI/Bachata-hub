import { redirect } from "next/navigation";
import { getCurrentUser, isModerator } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { t } from "@/lib/i18n/dictionary";
import { formatDateTime } from "@/lib/format";
import { ModerationActions } from "@/components/ModerationActions";
import { Card } from "@/components/ui/card";

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
        <div className="stack gap-3">
          {events.map((e) => (
            <Card key={e.id}>
              <strong>{e.title}</strong>
              <p className="hint-text my-1">
                {formatDateTime(e.startsAt)} · {e.city.nameRu} · {e.venueName}
              </p>
              <p className="m-0">
                {t.event.formats[e.format]} · {t.event.levels[e.level]}
              </p>
              <p className="hint-text my-1">
                {t.event.organizer}: {e.school?.name ?? e.organizerName ?? "—"} · {e.createdBy.email}
              </p>
              {e.description && <p className="my-1">{e.description}</p>}
              <ModerationActions endpoint={`/api/moderation/events/${e.id}`} />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
