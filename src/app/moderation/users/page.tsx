import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { t } from "@/lib/i18n/dictionary";
import { pluralizeRu } from "@/lib/format";
import { UserBlockToggle } from "@/components/UserBlockToggle";
import type { UserRole } from "@prisma/client";

const ROLES: UserRole[] = ["DANCER", "SCHOOL_REP", "ORGANIZER", "MODERATOR", "ADMIN"];

// Список всех пользователей — доступен только ADMIN (см. isAdmin): здесь
// видны e-mail всех аккаунтов и есть возможность блокировки, это более
// чувствительно, чем модерация контента, куда допущены и MODERATOR.
export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string }>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");
  if (!isAdmin(currentUser)) redirect("/");

  const sp = await searchParams;
  const q = sp.q?.trim() || "";
  const role = ROLES.includes(sp.role as UserRole) ? (sp.role as UserRole) : undefined;

  const users = await prisma.user.findMany({
    where: {
      ...(q ? { email: { contains: q, mode: "insensitive" } } : {}),
      ...(role ? { role } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div className="stack">
      <h1 className="page-title">{t.moderation.users}</h1>

      <form method="get" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input type="text" name="q" defaultValue={q} placeholder={t.moderation.searchByEmail} />
        <select name="role" defaultValue={role ?? ""}>
          <option value="">{t.common.all}</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {t.auth.roleNames[r]}
            </option>
          ))}
        </select>
        <button className="btn btn-sm" type="submit">
          {t.common.search}
        </button>
      </form>

      <p className="hint-text">
        {users.length} {pluralizeRu(users.length, t.moderation.usersFoundCount)}
      </p>

      {users.length === 0 ? (
        <p className="hint-text">{t.moderation.noUsersFound}</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border)", textAlign: "left" }}>
                <th style={{ padding: "6px 8px 6px 0" }}>{t.auth.email}</th>
                <th style={{ padding: "6px 8px" }}>{t.moderation.roleFilterLabel}</th>
                <th style={{ padding: "6px 8px" }}>{t.moderation.registeredAt}</th>
                <th style={{ padding: "6px 8px" }}>{t.moderation.lastLoginAt}</th>
                <th style={{ padding: "6px 8px" }}>{t.moderation.statusLabel}</th>
                <th style={{ padding: "6px 0" }} />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <td style={{ padding: "6px 8px 6px 0" }}>{u.email}</td>
                  <td style={{ padding: "6px 8px" }}>{t.auth.roleNames[u.role]}</td>
                  <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                    {u.createdAt.toLocaleDateString("ru-RU")}
                  </td>
                  <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                    {u.lastLoginAt ? u.lastLoginAt.toLocaleString("ru-RU") : t.moderation.neverLoggedIn}
                  </td>
                  <td style={{ padding: "6px 8px" }}>
                    {u.isBlocked ? t.moderation.statusBlocked : t.moderation.statusActive}
                  </td>
                  <td style={{ padding: "6px 0" }}>
                    {u.id !== currentUser.id && <UserBlockToggle userId={u.id} isBlocked={u.isBlocked} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
