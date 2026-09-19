import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getFestivalForEdit, computeFestivalStatus } from "@/server/events/festival-service";
import { isOwnerOrAdminFestival } from "@/server/events/access";
import { RegistrationForbiddenError, RegistrationNotFoundError } from "@/server/events/registration-service";
import { FestivalPublishButton } from "@/components/admin/festival/FestivalPublishButton";
import { FestivalArchiveButton } from "@/components/admin/festival/FestivalArchiveButton";
import { FestivalDeleteButton } from "@/components/admin/festival/FestivalDeleteButton";
import { AlertIcon } from "@/components/admin/icons";
import { formatEventDateRange } from "@/lib/format";
import { cn } from "@/lib/cn";

// Вкладка «Публикация» — Stage R3/F переноса UI-прототипа (2026-09-19/20).
// Чеклист остаётся ТОЛЬКО информационным (единственное реальное условие
// проверяет сервер — publishFestival() в festival-service.ts), "Обязательно"
// у пункта Pass — потому что это единственный пункт, от которого публикация
// действительно зависит, остальные — просто напоминание не забыть. Пункты и
// порядок — по образцу UI-прототипа.
export default async function FestivalPublishPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  let festival;
  try {
    festival = await getFestivalForEdit(id, user);
  } catch (e) {
    if (e instanceof RegistrationForbiddenError) redirect("/admin/festival");
    if (e instanceof RegistrationNotFoundError) notFound();
    throw e;
  }

  if (!isOwnerOrAdminFestival(festival, user)) redirect(`/admin/festival/${id}`);

  const status = computeFestivalStatus(festival);
  const passesCount = festival.eventId ? await prisma.pass.count({ where: { eventId: festival.eventId } }) : 0;

  const checklist = [
    { label: "Название и описание заполнены", done: Boolean(festival.name && festival.description), required: false },
    { label: "Даты и город указаны", done: Boolean(festival.startsAt && festival.cityId), required: false },
    { label: `Программа: минимум 1 пункт (сейчас ${festival.programItems.length})`, done: festival.programItems.length > 0, required: false },
    { label: "Настроен хотя бы один Pass", done: passesCount > 0, required: true },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.3fr_1fr]">
        <div className="flex flex-col gap-4">
          {status !== "PUBLISHED" && (
            <div className="rounded-app border border-admin-border bg-admin-card p-4">
              <h2 className="m-0 mb-3 text-sm font-semibold uppercase tracking-wide text-admin-muted">Готовность к публикации</h2>
              <ul className="m-0 flex list-none flex-col p-0 text-sm">
                {checklist.map((c) => (
                  <li key={c.label} className="flex items-center gap-2.5 border-b border-admin-border py-2.5 last:border-none">
                    <span
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-xs",
                        c.done ? "bg-night-success/15 text-night-success" : "border border-admin-border bg-admin-card2 text-admin-disabled"
                      )}
                    >
                      {c.done ? "✓" : "–"}
                    </span>
                    <span className={cn("flex-1", c.done ? "text-night-text" : "text-admin-muted")}>{c.label}</span>
                    {c.required && (
                      <span className="shrink-0 rounded-full bg-red-400/15 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-red-400">
                        Обязательно
                      </span>
                    )}
                  </li>
                ))}
              </ul>

              {festival.eventId && (
                <>
                  <FestivalPublishButton festivalId={festival.id} />
                  {passesCount === 0 && (
                    <p className="m-0 mt-2 text-xs text-admin-muted">
                      Кнопка недоступна, пока не создан хотя бы один Pass — он же даёт фестивалю реальное событие для модерации и страницы.
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {status !== "PUBLISHED" && (
            <div className={cn("rounded-app border-l-[3px] bg-admin-card p-4", festival.eventId ? "border-l-night-success" : "border-l-night-warning")}>
              {festival.eventId ? (
                <p className="m-0 text-sm text-night-text">Событие создано — можно публиковать фестиваль.</p>
              ) : (
                <>
                  <span className="mb-2 inline-block rounded-full bg-night-warning/15 px-2.5 py-1 text-[11px] font-bold text-night-warning">
                    Пассов пока нет
                  </span>
                  <p className="m-0 text-sm text-night-text">
                    Как только вы создадите Pass (Full, Day или любой другой) на вкладке «Пассы», фестиваль можно будет публиковать.
                  </p>
                  <Link
                    href={`/admin/festival/${festival.id}/passes`}
                    className="mt-3 block w-full rounded-app-sm border border-admin-border py-2 text-center text-sm font-semibold text-night-text no-underline hover:border-admin-primary hover:no-underline"
                  >
                    Перейти к пассам →
                  </Link>
                </>
              )}
            </div>
          )}

          {status === "PUBLISHED" && (
            <div className="rounded-app border border-admin-border bg-admin-card p-4">
              <h2 className="m-0 mb-3 text-sm font-semibold uppercase tracking-wide text-admin-muted">Публикация</h2>
              <p className="m-0 text-sm text-night-text">Фестиваль опубликован и виден на сайте.</p>
            </div>
          )}
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-admin-muted">Предпросмотр карточки на сайте</p>
          <div className="overflow-hidden rounded-app border border-night-border bg-night-card">
            <div className="relative flex aspect-video items-center justify-center overflow-hidden bg-gradient-to-br from-[#1d2b52] to-[#241a30] text-3xl">
              {festival.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={festival.coverUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span aria-hidden="true">🎪</span>
              )}
            </div>
            <div className="flex flex-col p-4">
              <span className="mb-2 w-fit rounded-full bg-night-card2 px-2.5 py-1 text-[10px] font-bold text-night-pink">Фестиваль</span>
              <strong className="mb-2 truncate text-night-text">{festival.name}</strong>
              <p className="m-0 mb-1 text-xs text-night-muted">📅 {formatEventDateRange(festival.startsAt, festival.endsAt)}</p>
              <p className="m-0 text-xs text-night-muted">📍 {festival.venueName ?? "—"}</p>
            </div>
          </div>
          <p className="m-0 mt-2.5 text-xs text-admin-muted">Так фестиваль увидят на сайте — с обложкой (вкладка «Обзор») после публикации.</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-app border border-red-400/35">
        <div className="flex items-center gap-2 bg-red-400/10 px-4 py-2.5 text-xs font-extrabold uppercase tracking-wide text-red-400">
          <AlertIcon />
          Опасная зона
        </div>
        {status === "PUBLISHED" ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-red-400/20 px-4 py-3.5">
            <div>
              <p className="m-0 text-sm font-semibold text-night-text">Снять с публикации</p>
              <p className="m-0 mt-0.5 max-w-md text-xs text-admin-muted">
                Скрывает со всех публичных страниц. Данные (программа/пассы/статистика) не удаляются — можно вернуть.
              </p>
            </div>
            <FestivalArchiveButton festivalId={festival.id} name={festival.name} />
          </div>
        ) : !festival.eventId ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-red-400/20 px-4 py-3.5">
            <div>
              <p className="m-0 text-sm font-semibold text-night-text">Удалить черновик безвозвратно</p>
              <p className="m-0 mt-0.5 max-w-md text-xs text-admin-muted">
                Доступно только для черновиков без опубликованной истории. Программа и команда удаляются вместе с фестивалем.
              </p>
            </div>
            <FestivalDeleteButton festivalId={festival.id} name={festival.name} />
          </div>
        ) : (
          <p className="m-0 border-t border-red-400/20 px-4 py-3.5 text-xs text-admin-muted">
            У фестиваля уже есть Pass — удаление черновика недоступно, историю продаж нельзя стереть молча.
          </p>
        )}
      </div>
    </div>
  );
}
