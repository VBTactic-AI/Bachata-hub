import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ModerationRowActions } from "@/components/admin/moderation/ModerationRowActions";
import { formatDateTime } from "@/lib/format";

// §7 ТЗ (Event Suggestions) — очередь предложений от обычных пользователей.
// Проще, чем organizer-requests (нет типов/payload/needs_info) — все поля
// показаны прямо в таблице, без модалки с деталями.
export default async function ModerationEventSuggestionsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isAdmin(user)) redirect("/admin");

  const suggestions = await prisma.eventSuggestion.findMany({
    where: { status: "PENDING" },
    include: { suggestedBy: { select: { email: true } }, city: { select: { nameRu: true } } },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="m-0 font-night text-xl font-extrabold text-night-text sm:text-2xl">Предложения событий</h1>
        <p className="m-0 mt-1 text-sm text-admin-muted">Идеи событий от пользователей — не полноценные заявки, а подсказки на проверку</p>
      </div>

      <div className="overflow-x-auto rounded-app border border-admin-border bg-admin-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-admin-card2 text-xs font-semibold uppercase tracking-wide text-admin-disabled">
            <tr>
              <th className="px-3 py-2.5 font-semibold">Событие</th>
              <th className="px-3 py-2.5 font-semibold">Город</th>
              <th className="px-3 py-2.5 font-semibold">Дата (по словам заявителя)</th>
              <th className="px-3 py-2.5 font-semibold">От кого</th>
              <th className="px-3 py-2.5 font-semibold">Подано</th>
              <th className="px-3 py-2.5 text-right font-semibold">Действия</th>
            </tr>
          </thead>
          <tbody>
            {suggestions.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-admin-muted">
                  Нет предложений, ожидающих проверки
                </td>
              </tr>
            ) : (
              suggestions.map((s) => (
                <tr key={s.id} className="border-t border-admin-border align-top">
                  <td className="px-3 py-2.5">
                    <p className="m-0 font-medium text-night-text">{s.title}</p>
                    <p className="m-0 mt-0.5 max-w-[320px] text-xs text-admin-muted">{s.description}</p>
                    {s.link && (
                      <a href={s.link} target="_blank" rel="noreferrer" className="mt-0.5 inline-block text-xs text-admin-primary hover:underline">
                        Ссылка →
                      </a>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-admin-muted">{s.city?.nameRu ?? "—"}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-admin-muted">{s.proposedDate ? formatDateTime(s.proposedDate) : "—"}</td>
                  <td className="px-3 py-2.5 text-admin-muted">{s.suggestedBy.email}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-admin-disabled">{s.createdAt.toLocaleDateString("ru-RU")}</td>
                  <td className="px-3 py-2.5">
                    <ModerationRowActions endpoint={`/api/moderation/event-suggestions/${s.id}`} />
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
