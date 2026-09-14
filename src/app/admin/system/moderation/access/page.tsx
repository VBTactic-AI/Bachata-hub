import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { RevokeAccessButton } from "@/components/admin/moderation/RevokeAccessButton";

const TYPE_LABELS = {
  EVENT_ORGANIZER: "Организатор мероприятий",
  FESTIVAL_ORGANIZER: "Организатор фестиваля",
  SCHOOL_HEAD: "Руководитель школы",
  COMPETITION_ORGANIZER: "Организатор соревнований",
} as const;

// Все выданные сейчас доступы — по прямому запросу пользователя ("супер-админ
// должен иметь возможность забрать роль на всякий случай"). Источник истины —
// сам AccessRequest.status: APPROVED = доступ действует сейчас, отзыв
// переводит его в REVOKED (см. src/server/access-requests/revoke.ts) — не
// нужна отдельная модель "текущий грант", строка заявки уже это представляет.
export default async function ModerationAccessPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isAdmin(user)) redirect("/admin");

  const granted = await prisma.accessRequest.findMany({
    where: { status: "APPROVED" },
    include: { user: true },
    orderBy: { reviewedAt: "desc" },
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="m-0 font-night text-xl font-extrabold text-night-text sm:text-2xl">Выданные доступы</h1>
        <p className="m-0 mt-1 text-sm text-admin-muted">
          Уже одобренные заявки — можно отозвать доступ, не теряя уже созданные события/соревнования/школу.
        </p>
      </div>

      <div className="overflow-x-auto rounded-app border border-admin-border bg-admin-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-admin-card2 text-xs font-semibold uppercase tracking-wide text-admin-disabled">
            <tr>
              <th className="px-3 py-2.5 font-semibold">Тип</th>
              <th className="px-3 py-2.5 font-semibold">Пользователь</th>
              <th className="px-3 py-2.5 font-semibold">Название/бренд</th>
              <th className="px-3 py-2.5 font-semibold">Одобрено</th>
              <th className="px-3 py-2.5 text-right font-semibold">Действия</th>
            </tr>
          </thead>
          <tbody>
            {granted.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-admin-muted">
                  Пока никому не выдан доступ
                </td>
              </tr>
            ) : (
              granted.map((r) => (
                <tr key={r.id} className="border-t border-admin-border align-top">
                  <td className="px-3 py-2.5 text-admin-muted">{TYPE_LABELS[r.type]}</td>
                  <td className="px-3 py-2.5 text-admin-muted">{r.user.email}</td>
                  <td className="px-3 py-2.5 text-night-text">{r.brandName}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-admin-disabled">
                    {r.reviewedAt ? r.reviewedAt.toLocaleDateString("ru-RU") : "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <RevokeAccessButton endpoint={`/api/moderation/access-requests/${r.id}`} />
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
