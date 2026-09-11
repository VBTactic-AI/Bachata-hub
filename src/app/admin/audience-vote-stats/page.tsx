import { redirect } from "next/navigation";
import { getActor } from "@/server/rbac/actor";
import { can } from "@/server/rbac/authorize";
import { getAudienceAwardLeaderboard } from "@/server/statistics/audience-vote-statistics";

const ROLE_LABEL: Record<string, string> = { LEADER: "Партнёр", FOLLOWER: "Партнёрша", ANY: "Общий приз" };
const DATE_FMT = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", year: "numeric" });

// Сводка "Приз зрительских симпатий" по ВСЕМ соревнованиям сразу — только
// SUPER_ADMIN (docs/00_DECISIONS.md, план "Приз зрительских симпатий").
// По образцу /admin/round-stages — плоский top-level роут, не привязан к
// одному соревнованию.
export default async function AudienceVoteStatsPage() {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (!can(actor, "statistics:view")) redirect("/admin/competitions");

  const rows = await getAudienceAwardLeaderboard();

  const byDancer = new Map<string, { displayName: string; count: number }>();
  for (const r of rows) {
    const entry = byDancer.get(r.dancerId) ?? { displayName: r.displayName, count: 0 };
    entry.count += 1;
    byDancer.set(r.dancerId, entry);
  }
  const leaderboard = [...byDancer.entries()].sort((a, b) => b[1].count - a[1].count);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="m-0 font-night text-xl font-extrabold text-night-text sm:text-2xl">🏆 Приз зрительских симпатий</h1>
        <p className="m-0 mt-1 text-sm text-admin-muted">Сводка по всем соревнованиям</p>
      </div>

      {leaderboard.length > 0 && (
        <div className="overflow-x-auto rounded-app border border-admin-border bg-admin-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-admin-card2 text-xs font-semibold uppercase tracking-wide text-admin-disabled">
              <tr>
                <th className="px-3 py-2.5 font-semibold">Танцор</th>
                <th className="px-3 py-2.5 text-right font-semibold">Сколько раз получал(а)</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map(([dancerId, e]) => (
                <tr key={dancerId} className="border-t border-admin-border">
                  <td className="px-3 py-2.5 text-night-text">{e.displayName}</td>
                  <td className="px-3 py-2.5 text-right font-semibold text-night-text">{e.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="overflow-x-auto rounded-app border border-admin-border bg-admin-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-admin-card2 text-xs font-semibold uppercase tracking-wide text-admin-disabled">
            <tr>
              <th className="px-3 py-2.5 font-semibold">Танцор</th>
              <th className="px-3 py-2.5 font-semibold">Соревнование</th>
              <th className="px-3 py-2.5 font-semibold">Категория</th>
              <th className="px-3 py-2.5 font-semibold">Приз</th>
              <th className="px-3 py-2.5 text-right font-semibold">Голосов</th>
              <th className="px-3 py-2.5 font-semibold">Дата</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-admin-muted">
                  Пока нет опубликованных результатов голосования.
                </td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr key={i} className="border-t border-admin-border">
                  <td className="px-3 py-2.5 text-night-text">{r.displayName}</td>
                  <td className="px-3 py-2.5 text-night-text">{r.competitionName}</td>
                  <td className="px-3 py-2.5 text-admin-muted">{r.categoryName}</td>
                  <td className="px-3 py-2.5 text-admin-muted">{ROLE_LABEL[r.role] ?? r.role}</td>
                  <td className="px-3 py-2.5 text-right font-semibold text-night-text">{r.voteCount}</td>
                  <td className="px-3 py-2.5 text-admin-muted">{DATE_FMT.format(new Date(r.achievedAt))}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
