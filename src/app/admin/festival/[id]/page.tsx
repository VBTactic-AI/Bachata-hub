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

  // Чек-лист готовности (2026-09-17, Stage UI-4) — ТОЛЬКО информационный,
  // ничего не блокирует: единственное реальное условие публикации проверяет
  // сервер (publishFestival в festival-service.ts — хотя бы один Pass), эти
  // пункты просто помогают организатору не забыть заполнить остальное перед
  // тем, как звать гостей на страницу.
  const [sponsorsCount, faqCount, passesCount] = await Promise.all([
    prisma.festivalSponsor.count({ where: { festivalId: festival.id } }),
    prisma.festivalFaqItem.count({ where: { festivalId: festival.id } }),
    festival.eventId ? prisma.pass.count({ where: { eventId: festival.eventId } }) : Promise.resolve(0),
  ]);
  const checklist = [
    { label: "Программа заполнена", done: programItemsCount > 0 },
    { label: "Хотя бы один Pass создан", done: passesCount > 0 },
    { label: "Спонсоры добавлены", done: sponsorsCount > 0 },
    { label: "FAQ заполнен", done: faqCount > 0 },
  ];

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

      {canManage && status !== "PUBLISHED" && (
        <div className="rounded-app border border-admin-border bg-admin-card p-4">
          <h2 className="m-0 mb-3 text-sm font-semibold uppercase tracking-wide text-admin-muted">Готовность к публикации</h2>
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-sm">
            {checklist.map((c) => (
              <li key={c.label} className="flex items-center gap-2">
                <span className={c.done ? "text-night-success" : "text-admin-muted"}>{c.done ? "✓" : "○"}</span>
                <span className={c.done ? "text-night-text" : "text-admin-muted"}>{c.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

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
