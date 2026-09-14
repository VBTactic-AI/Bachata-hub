import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ModerationRowActions } from "@/components/admin/moderation/ModerationRowActions";
import { OrganizerRequestDetailModal } from "@/components/admin/moderation/OrganizerRequestDetailModal";

// Заявки на доступ "Организатор мероприятий"/"Организатор фестиваля"/
// "Организатор соревнований" — одна страница на все три (концептуально
// однородны, "хочу стать организатором X"), в отличие от школы, у которой
// свой исторический пункт /admin/moderation/schools (см. docs/00_DECISIONS.md,
// 2026-09-14).
const TYPE_LABELS = {
  EVENT_ORGANIZER: "Организатор мероприятий",
  FESTIVAL_ORGANIZER: "Организатор фестиваля",
  COMPETITION_ORGANIZER: "Организатор соревнований",
} as const;

export default async function ModerationOrganizerRequestsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isAdmin(user)) redirect("/admin");

  const requests = await prisma.accessRequest.findMany({
    where: {
      type: { in: ["EVENT_ORGANIZER", "FESTIVAL_ORGANIZER", "COMPETITION_ORGANIZER"] },
      status: { in: ["PENDING", "NEEDS_INFO"] },
    },
    include: { user: true, city: true, country: true },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="m-0 font-night text-xl font-extrabold text-night-text sm:text-2xl">Заявки организаторов</h1>
        <p className="m-0 mt-1 text-sm text-admin-muted">
          Организатор мероприятий, фестиваля, соревнований — заявки на проверку
        </p>
      </div>

      <div className="overflow-x-auto rounded-app border border-admin-border bg-admin-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-admin-card2 text-xs font-semibold uppercase tracking-wide text-admin-disabled">
            <tr>
              <th className="px-3 py-2.5 font-semibold">Тип</th>
              <th className="px-3 py-2.5 font-semibold">Заявка</th>
              <th className="px-3 py-2.5 font-semibold">Заявитель</th>
              <th className="px-3 py-2.5 font-semibold">Подана</th>
              <th className="px-3 py-2.5 text-right font-semibold">Действия</th>
            </tr>
          </thead>
          <tbody>
            {requests.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-admin-muted">
                  Нет заявок, ожидающих проверки
                </td>
              </tr>
            ) : (
              requests.map((r) => {
                const links = (r.links as unknown as { type: string; url: string }[]) ?? [];
                return (
                  <tr key={r.id} className="border-t border-admin-border align-top">
                    <td className="px-3 py-2.5 text-admin-muted">{TYPE_LABELS[r.type as keyof typeof TYPE_LABELS] ?? r.type}</td>
                    <td className="px-3 py-2.5">
                      <OrganizerRequestDetailModal
                        request={{
                          id: r.id,
                          type: r.type,
                          brandName: r.brandName,
                          description: r.description,
                          cityName: r.city?.nameRu ?? null,
                          countryName: r.country?.nameRu ?? null,
                          applicantEmail: r.user.email,
                          phone: r.phone,
                          links,
                          payload: r.payload as Record<string, unknown>,
                          status: r.status,
                          createdAt: r.createdAt.toISOString(),
                        }}
                        actions={<ModerationRowActions endpoint={`/api/moderation/access-requests/${r.id}`} showNeedsInfo />}
                        trigger={
                          <p className="m-0 font-medium text-night-text underline decoration-admin-border decoration-dotted underline-offset-4">
                            {r.brandName}
                          </p>
                        }
                      />
                    </td>
                    <td className="px-3 py-2.5 text-admin-muted">{r.user.email}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-admin-disabled">{r.createdAt.toLocaleDateString("ru-RU")}</td>
                    <td className="px-3 py-2.5">
                      <ModerationRowActions endpoint={`/api/moderation/access-requests/${r.id}`} showNeedsInfo />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
