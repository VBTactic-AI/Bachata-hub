import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getDancerByUserId } from "@/lib/dancer";
import { prisma } from "@/lib/prisma";
import { getMyAccessRequests } from "@/server/access-requests/queries";
import { BecomeOrganizerWizard } from "@/components/become-organizer/BecomeOrganizerWizard";
import { AccessRequestStatusList } from "@/components/become-organizer/AccessRequestStatusList";

// Единая публичная точка входа для заявки на проверенный доступ (организатор
// событий/фестиваля, руководитель школы, организатор соревнований) — заменяет
// прежний свободный выбор роли при регистрации (docs/00_DECISIONS.md,
// 2026-09-14). Доступ выдаёт только супер-админ, по заявке и модерации.
export default async function BecomeOrganizerPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/become-organizer");

  const [dancer, cities, myRequests] = await Promise.all([
    getDancerByUserId(user.id),
    prisma.city.findMany({ where: { isActive: true }, orderBy: { nameRu: "asc" }, select: { id: true, nameRu: true, countryId: true } }),
    getMyAccessRequests(user.id),
  ]);

  // Уже есть активная (не отклонённая/не отозванная) заявка на каждый из 4
  // типов — не даём подать повторную заявку того же типа, пока она в работе;
  // остальные типы всё ещё можно запросить отдельно.
  const activeTypes = new Set(
    myRequests.filter((r) => r.status === "PENDING" || r.status === "NEEDS_INFO" || r.status === "APPROVED").map((r) => r.type)
  );
  const allFourRequested = activeTypes.size >= 4;

  return (
    <div className="flex flex-col gap-5 pb-4">
      <div>
        <h1 className="m-0 font-night text-2xl font-extrabold tracking-tight text-night-text">Стать организатором</h1>
        <p className="m-0 mt-1 text-sm text-night-muted">
          Организатор мероприятий, фестиваля, руководитель школы или организатор соревнований — доступ выдаётся после проверки.
        </p>
      </div>

      {myRequests.length > 0 && <AccessRequestStatusList requests={myRequests} />}

      {allFourRequested ? (
        <p className="text-sm text-night-muted">По всем видам доступа уже есть активная заявка — новую подавать не нужно.</p>
      ) : (
        <BecomeOrganizerWizard cities={cities} initialCityId={dancer?.cityId ?? null} />
      )}
    </div>
  );
}
