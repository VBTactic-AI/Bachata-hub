import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { t } from "@/lib/i18n/dictionary";

// Перенесено из /moderation/log (2026-09-11), редизайн под admin-*.
export default async function ModerationLogPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isAdmin(user)) redirect("/admin");

  const logs = await prisma.moderationLog.findMany({
    include: { actor: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="m-0 font-night text-xl font-extrabold text-night-text sm:text-2xl">{t.moderation.log}</h1>
        <p className="m-0 mt-1 text-sm text-admin-muted">Последние 100 решений модераторов</p>
      </div>

      <div className="overflow-x-auto rounded-app border border-admin-border bg-admin-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-admin-card2 text-xs font-semibold uppercase tracking-wide text-admin-disabled">
            <tr>
              <th className="px-3 py-2.5 font-semibold">Дата</th>
              <th className="px-3 py-2.5 font-semibold">Кто</th>
              <th className="px-3 py-2.5 font-semibold">Сущность</th>
              <th className="px-3 py-2.5 font-semibold">Действие</th>
              <th className="px-3 py-2.5 font-semibold">Причина</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-admin-muted">
                  {t.moderation.logEmpty}
                </td>
              </tr>
            ) : (
              logs.map((l) => (
                <tr key={l.id} className="border-t border-admin-border">
                  <td className="whitespace-nowrap px-3 py-2.5 text-admin-disabled">{l.createdAt.toLocaleString("ru-RU")}</td>
                  <td className="px-3 py-2.5 text-night-text">{l.actor.email}</td>
                  <td className="px-3 py-2.5 text-admin-muted">{l.entity}</td>
                  <td className="px-3 py-2.5 text-admin-muted">{l.action}</td>
                  <td className="px-3 py-2.5 text-admin-muted">{l.reason ?? ""}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
