import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { t } from "@/lib/i18n/dictionary";
import { pluralizeRu } from "@/lib/format";
import { UserBlockToggle } from "@/components/UserBlockToggle";
import type { UserRole } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";

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

      <form method="get" className="flex flex-wrap gap-2">
        <Input type="text" name="q" defaultValue={q} placeholder={t.moderation.searchByEmail} className="w-auto" />
        <Select name="role" defaultValue={role ?? ""} className="w-auto">
          <option value="">{t.common.all}</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {t.auth.roleNames[r]}
            </option>
          ))}
        </Select>
        <Button size="sm" type="submit">
          {t.common.search}
        </Button>
      </form>

      <p className="hint-text">
        {users.length} {pluralizeRu(users.length, t.moderation.usersFoundCount)}
      </p>

      {users.length === 0 ? (
        <p className="hint-text">{t.moderation.noUsersFound}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="py-1.5 pr-2">{t.auth.email}</th>
                <th className="px-2 py-1.5">{t.moderation.roleFilterLabel}</th>
                <th className="px-2 py-1.5">{t.moderation.registeredAt}</th>
                <th className="px-2 py-1.5">{t.moderation.lastLoginAt}</th>
                <th className="px-2 py-1.5">{t.moderation.statusLabel}</th>
                <th className="py-1.5" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-line">
                  <td className="py-1.5 pr-2">{u.email}</td>
                  <td className="px-2 py-1.5">{t.auth.roleNames[u.role]}</td>
                  <td className="whitespace-nowrap px-2 py-1.5">
                    {u.createdAt.toLocaleDateString("ru-RU")}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5">
                    {u.lastLoginAt ? u.lastLoginAt.toLocaleString("ru-RU") : t.moderation.neverLoggedIn}
                  </td>
                  <td className="px-2 py-1.5">
                    {u.isBlocked ? t.moderation.statusBlocked : t.moderation.statusActive}
                  </td>
                  <td className="py-1.5">
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
