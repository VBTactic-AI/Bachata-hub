import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { t } from "@/lib/i18n/dictionary";
import { formatDateTime } from "@/lib/format";
import { ModerationRowActions } from "@/components/admin/moderation/ModerationRowActions";
import { EventDetailModal } from "@/components/admin/moderation/EventDetailModal";

// Перенесено из /moderation/events (2026-09-11), редизайн под admin-*.
export default async function ModerationEventsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isAdmin(user)) redirect("/admin");

  const events = await prisma.event.findMany({
    // status: "PUBLISHED" — черновики Event Wizard'а (Event Engine) никогда
    // не отправлены на модерацию, хотя moderationStatus у них по умолчанию
    // тоже PENDING (колонка NOT NULL) — без этого фильтра сюда попадали бы
    // чужие незавершённые черновики.
    where: { moderationStatus: "PENDING", status: "PUBLISHED" },
    include: { city: true, school: true, createdBy: true },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="m-0 font-night text-xl font-extrabold text-night-text sm:text-2xl">{t.moderation.events}</h1>
        <p className="m-0 mt-1 text-sm text-admin-muted">Ожидают проверки перед публикацией в календаре</p>
      </div>

      <div className="overflow-x-auto rounded-app border border-admin-border bg-admin-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-admin-card2 text-xs font-semibold uppercase tracking-wide text-admin-disabled">
            <tr>
              <th className="px-3 py-2.5 font-semibold">Событие</th>
              <th className="px-3 py-2.5 font-semibold">Формат · уровень</th>
              <th className="px-3 py-2.5 font-semibold">Организатор</th>
              <th className="px-3 py-2.5 text-right font-semibold">Действия</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-admin-muted">
                  {t.moderation.noPendingEvents}
                </td>
              </tr>
            ) : (
              events.map((e) => (
                <tr key={e.id} className="border-t border-admin-border align-top">
                  <td className="px-3 py-2.5">
                    {/* Клик по событию — полная карточка (2026-09-12, по
                        прямому запросу пользователя): описание в строке
                        таблицы обрезано, а фото/цену/ссылку/теги в неё вообще
                        не поместить. Действия внутри карточки — тот же
                        компонент, что и в самой строке, не дублируем логику. */}
                    <EventDetailModal
                      event={{
                        id: e.id,
                        title: e.title,
                        format: e.format,
                        level: e.level,
                        startsAt: e.startsAt.toISOString(),
                        endsAt: e.endsAt ? e.endsAt.toISOString() : null,
                        cityName: e.city.nameRu,
                        venueName: e.venueName,
                        venueAddress: e.venueAddress,
                        description: e.description,
                        photoUrl: e.photoUrl,
                        priceText: e.priceText,
                        externalLinkUrl: e.externalLinkUrl,
                        tags: e.tags,
                        schoolName: e.school?.name ?? null,
                        organizerName: e.organizerName,
                        createdByEmail: e.createdBy.email,
                        createdAt: e.createdAt.toISOString(),
                      }}
                      actions={<ModerationRowActions endpoint={`/api/moderation/events/${e.id}`} />}
                      trigger={
                        <div>
                          <p className="m-0 font-medium text-night-text underline decoration-admin-border decoration-dotted underline-offset-4">
                            {e.title}
                          </p>
                          <p className="m-0 mt-0.5 text-xs text-admin-muted">
                            {formatDateTime(e.startsAt)} · {e.city.nameRu} · {e.venueName}
                          </p>
                          {e.description && (
                            <p className="m-0 mt-1 max-w-[360px] truncate text-xs text-admin-disabled">{e.description}</p>
                          )}
                        </div>
                      }
                    />
                  </td>
                  <td className="px-3 py-2.5 text-admin-muted">
                    {t.event.formats[e.format]} · {t.event.levels[e.level]}
                  </td>
                  <td className="px-3 py-2.5">
                    <p className="m-0 text-night-text">{e.school?.name ?? e.organizerName ?? "—"}</p>
                    <p className="m-0 text-xs text-admin-disabled">{e.createdBy.email}</p>
                  </td>
                  <td className="px-3 py-2.5">
                    <ModerationRowActions endpoint={`/api/moderation/events/${e.id}`} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
