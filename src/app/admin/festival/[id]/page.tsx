import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getFestivalForEdit, computeFestivalStatus } from "@/server/events/festival-service";
import { isOwnerOrAdminFestival } from "@/server/events/access";
import { RegistrationForbiddenError, RegistrationNotFoundError } from "@/server/events/registration-service";
import { FestivalOverviewForm } from "@/components/admin/festival/FestivalOverviewForm";
import { FestivalPublishButton } from "@/components/admin/festival/FestivalPublishButton";
import { FestivalArchiveButton } from "@/components/admin/festival/FestivalArchiveButton";
import { FestivalDeleteButton } from "@/components/admin/festival/FestivalDeleteButton";
import { StatCard } from "@/components/admin/StatCard";
import { GridIcon } from "@/components/admin/icons";

// Вкладка «Обзор» консоли фестиваля (перенос UI, продолжение сервисного
// слоя) — основная информация + публикация/архивация/удаление. Доступ уже
// проверен в layout.tsx — здесь читаем те же данные заново напрямую через
// getFestivalForEdit (тот же принцип, что и EventOverviewPage — не
// разойтись в цифрах с другими вкладками).
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
  const programItemsCount = festival.programItems.length;
  const status = computeFestivalStatus(festival);
  const canManage = isOwnerOrAdminFestival(festival, user);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Пунктов программы" value={programItemsCount} icon={<GridIcon />} tone="primary" href={`/admin/festival/${festival.id}/program`} />
      </div>

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

      {canManage && (
        <div className="rounded-app border border-admin-border bg-admin-card p-4">
          <h2 className="m-0 mb-3 text-sm font-semibold uppercase tracking-wide text-admin-muted">Публикация</h2>
          {status === "PUBLISHED" ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="m-0 text-sm text-night-text">Фестиваль опубликован и виден на сайте.</p>
              <FestivalArchiveButton festivalId={festival.id} name={festival.name} />
            </div>
          ) : festival.eventId ? (
            <FestivalPublishButton festivalId={festival.id} />
          ) : (
            <div className="flex flex-col gap-2">
              <p className="m-0 text-sm text-admin-muted">
                Чтобы опубликовать фестиваль, сначала создайте хотя бы один Pass — вкладка «Пассы».
              </p>
              <div>
                <FestivalDeleteButton festivalId={festival.id} name={festival.name} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
