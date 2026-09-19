import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getFestivalForEdit, computeFestivalStatus } from "@/server/events/festival-service";
import { RegistrationForbiddenError, RegistrationNotFoundError } from "@/server/events/registration-service";
import { FestivalOverviewForm } from "@/components/admin/festival/FestivalOverviewForm";
import { StatCard } from "@/components/admin/StatCard";
import { GridIcon, CalendarIcon, PeopleIcon, CardIcon } from "@/components/admin/icons";
import { cn } from "@/lib/cn";

// Вкладка «Обзор» консоли фестиваля (Stage R3 переноса UI-прототипа,
// 2026-09-19) — публикация/архивация/удаление переехали на отдельную
// вкладку «Публикация» (см. FestivalDashboardTabs.tsx), здесь остаётся
// основная информация + KPI-плитки + карточка статуса bridge-Event.
export default async function FestivalOverviewPage({ params }: { params: Promise<{ id: string }> }) {
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

  const cities = await prisma.city.findMany({ where: { isActive: true }, orderBy: { nameRu: "asc" }, select: { id: true, nameRu: true } });
  const status = computeFestivalStatus(festival);

  const programItemsCount = festival.programItems.length;
  const programDaysCount = new Set(festival.programItems.map((i) => i.startTime.toDateString())).size;
  const teachersCount = new Set(festival.programItems.map((i) => i.teacherId).filter((v): v is string => v != null)).size;
  const passesSoldCount = festival.eventId
    ? await prisma.ticket.count({ where: { eventId: festival.eventId, passId: { not: null }, status: "ISSUED" } })
    : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Дня программы" value={programDaysCount} icon={<CalendarIcon />} tone="primary" href={`/admin/festival/${festival.id}/program`} />
        <StatCard label="Пунктов программы" value={programItemsCount} icon={<GridIcon />} tone="primary" href={`/admin/festival/${festival.id}/program`} />
        <StatCard label="Преподавателей" value={teachersCount} icon={<PeopleIcon />} tone="success" href={`/admin/festival/${festival.id}/program`} />
        <StatCard label="Пассов продано" value={passesSoldCount} icon={<CardIcon />} tone="primary" href={`/admin/festival/${festival.id}/passes`} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.3fr_1fr]">
        <FestivalOverviewForm
          festival={{
            id: festival.id,
            name: festival.name,
            description: festival.description,
            cityId: festival.cityId,
            venueName: festival.venueName,
            startsAt: festival.startsAt.toISOString(),
            endsAt: festival.endsAt ? festival.endsAt.toISOString() : null,
          }}
          cities={cities}
        />

        <div className={cn("rounded-app border-l-[3px] bg-admin-card p-4", festival.eventId ? "border-l-night-success" : "border-l-night-warning")}>
          <h2 className="m-0 mb-2 text-sm font-semibold uppercase tracking-wide text-admin-muted">Связанное событие</h2>
          {festival.eventId ? (
            <>
              <p className="m-0 text-sm text-night-text">
                Служебное событие создано и привязано — на нём продаются Pass{status === "PUBLISHED" ? " и работает публичная страница" : ""}.
              </p>
              <p className="m-0 mt-2 text-xs text-admin-muted">
                Появилось автоматически при создании первого Pass — отдельно выбирать/создавать его не нужно.
              </p>
            </>
          ) : (
            <>
              <p className="m-0 text-sm text-admin-muted">Ещё не создано — появится автоматически, как только вы создадите первый Pass.</p>
              <p className="m-0 mt-2 text-xs text-admin-muted">До этого момента опубликовать фестиваль нельзя (см. вкладку «Публикация»).</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
