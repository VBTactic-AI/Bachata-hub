import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getDancerByUserId } from "@/lib/dancer";
import { prisma } from "@/lib/prisma";
import { getMyAccessRequests } from "@/server/access-requests/queries";
import { BecomeOrganizerWizard, type RequestStatusByType } from "@/components/become-organizer/BecomeOrganizerWizard";

// Единая публичная точка входа для заявки на проверенный доступ (организатор
// событий/фестиваля, руководитель школы, организатор соревнований) — заменяет
// прежний свободный выбор роли при регистрации (docs/00_DECISIONS.md,
// 2026-09-14). Доступ выдаёт только супер-админ, по заявке и модерации.
//
// Редизайн (2026-09-16, по прямому запросу пользователя) — отдельный список
// "Мои заявки на доступ" (AccessRequestStatusList) убран с этой страницы:
// статус каждого типа теперь виден прямо на карточке роли в самом визарде
// (подсветка цветом + подсказка по наведению, см. BecomeOrganizerWizard.tsx).
export default async function BecomeOrganizerPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/become-organizer");

  const [dancer, cities, myRequests] = await Promise.all([
    getDancerByUserId(user.id),
    prisma.city.findMany({ where: { isActive: true }, orderBy: { nameRu: "asc" }, select: { id: true, nameRu: true, countryId: true } }),
    getMyAccessRequests(user.id),
  ]);

  // Самая свежая заявка по каждому типу (myRequests уже отсортирован по
  // createdAt desc в getMyAccessRequests — первая встреченная запись на тип
  // и есть самая свежая). Если человек подавал заявку одного типа несколько
  // раз (например, отклонили — подал заново), в карточке роли отражается
  // именно последнее решение, а не история целиком.
  const latestByType: RequestStatusByType = {};
  for (const r of myRequests) {
    if (!latestByType[r.type]) latestByType[r.type] = { status: r.status, reviewComment: r.reviewComment };
  }

  // PENDING/APPROVED — по прямому решению пользователя — блокируют повторную
  // заявку по этому типу (одна уже одобрена или уже рассматривается);
  // NEEDS_INFO/REJECTED/REVOKED осознанно НЕ блокируют — можно подать заново
  // сразу же, без ожидания. "Нечего больше запросить" — когда все 4 типа
  // заблокированы одновременно.
  const blockedCount = Object.values(latestByType).filter((r) => r.status === "PENDING" || r.status === "APPROVED").length;
  const allBlocked = blockedCount >= 4;

  return (
    <div className="flex flex-col gap-5 pb-4">
      {/* Заголовок/подзаголовок — часть OrganizerHeroPanel внутри визарда;
          здесь нужен только когда сам визард не показан (нечего больше
          запросить), иначе получилось бы два одинаковых заголовка подряд. */}
      {allBlocked && (
        <div>
          <h1 className="m-0 font-night text-2xl font-extrabold tracking-tight text-night-text">Стать организатором</h1>
          <p className="m-0 mt-1 text-sm text-night-muted">
            Организатор мероприятий, фестиваля, руководитель школы или организатор соревнований — доступ выдаётся после проверки.
          </p>
        </div>
      )}

      {allBlocked ? (
        <p className="text-sm text-night-muted">По всем видам доступа уже есть одобренная или рассматриваемая заявка — новую подавать не нужно.</p>
      ) : (
        <BecomeOrganizerWizard cities={cities} initialCityId={dancer?.cityId ?? null} requestStatusByType={latestByType} />
      )}
    </div>
  );
}
