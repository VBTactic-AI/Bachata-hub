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
import { cn } from "@/lib/cn";

// Вкладка «Публикация» — Stage R3 переноса UI-прототипа (2026-09-19),
// вынесена с «Обзора» в отдельную вкладку (см. FestivalDashboardTabs.tsx).
// Чеклист остаётся ТОЛЬКО информационным (единственное реальное условие
// проверяет сервер — publishFestival() в festival-service.ts), "Обязательно"
// у пункта Pass — потому что это единственный пункт, от которого публикация
// действительно зависит, остальные — просто напоминание не забыть.
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
  const [sponsorsCount, faqCount, passesCount] = await Promise.all([
    prisma.festivalSponsor.count({ where: { festivalId: festival.id } }),
    prisma.festivalFaqItem.count({ where: { festivalId: festival.id } }),
    festival.eventId ? prisma.pass.count({ where: { eventId: festival.eventId } }) : Promise.resolve(0),
  ]);

  const checklist = [
    { label: "Хотя бы один Pass создан", done: passesCount > 0, required: true },
    { label: "Программа заполнена", done: festival.programItems.length > 0, required: false },
    { label: "Спонсоры добавлены", done: sponsorsCount > 0, required: false },
    { label: "FAQ заполнен", done: faqCount > 0, required: false },
  ];

  return (
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
                  {c.done ? "✓" : ""}
                </span>
                <span className={cn("flex-1", c.done ? "text-night-text" : "text-admin-muted")}>{c.label}</span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide",
                    c.required ? "bg-red-400/15 text-red-400" : "bg-admin-muted/15 text-admin-muted"
                  )}
                >
                  {c.required ? "Обязательно" : "Опционально"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-app border border-admin-border bg-admin-card p-4">
        <h2 className="m-0 mb-3 text-sm font-semibold uppercase tracking-wide text-admin-muted">Публикация</h2>
        {status === "PUBLISHED" ? (
          <p className="m-0 text-sm text-night-text">Фестиваль опубликован и виден на сайте.</p>
        ) : festival.eventId ? (
          <FestivalPublishButton festivalId={festival.id} />
        ) : (
          <p className="m-0 text-sm text-admin-muted">Чтобы опубликовать фестиваль, сначала создайте хотя бы один Pass — вкладка «Пассы».</p>
        )}
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
              <p className="m-0 mt-0.5 max-w-md text-xs text-admin-muted">Фестиваль перестанет быть виден на сайте — вернуть можно только вручную через администратора.</p>
            </div>
            <FestivalArchiveButton festivalId={festival.id} name={festival.name} />
          </div>
        ) : !festival.eventId ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-red-400/20 px-4 py-3.5">
            <div>
              <p className="m-0 text-sm font-semibold text-night-text">Удалить черновик</p>
              <p className="m-0 mt-0.5 max-w-md text-xs text-admin-muted">Необратимо. Доступно, только пока у фестиваля нет ни одного Pass.</p>
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
