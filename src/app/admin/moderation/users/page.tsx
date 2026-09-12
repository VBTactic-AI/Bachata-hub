import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { t } from "@/lib/i18n/dictionary";
import { pluralizeRu } from "@/lib/format";
import { UserBlockToggle } from "@/components/admin/moderation/UserBlockToggle";
import type { UserRole } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { StatusBadge } from "@/components/admin/StatusBadge";

const ROLES: UserRole[] = ["DANCER", "SCHOOL_REP", "ORGANIZER", "MODERATOR", "ADMIN"];
const FIELD_CLASS = "!w-auto border-admin-border bg-admin-card2 text-sm text-night-text focus:border-admin-primary focus:ring-admin-primary/20";

// Перенесено из /moderation/users (2026-09-11), редизайн под admin-*. Список
// всех пользователей и блокировка — по-прежнему только ADMIN.
export default async function AdminModerationUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string }>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");
  if (!isAdmin(currentUser)) redirect("/admin");

  const sp = await searchParams;
  const q = sp.q?.trim() || "";
  const role = ROLES.includes(sp.role as UserRole) ? (sp.role as UserRole) : undefined;

  const users = await prisma.user.findMany({
    where: {
      // Поиск по имени (2026-09-12, по прямому запросу пользователя) — имени
      // как отдельного поля у User нет, оно живёт в связанном профиле танцора
      // (Dancer.displayName, есть не у всех: школы/организаторы/модераторы
      // могут не иметь такого профиля). Ищем по email ИЛИ по имени —
      // совпадение любого из двух показывает пользователя.
      ...(q
        ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { dancer: { displayName: { contains: q, mode: "insensitive" } } }] }
        : {}),
      ...(role ? { role } : {}),
    },
    include: { dancer: { select: { displayName: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="m-0 font-night text-xl font-extrabold text-night-text sm:text-2xl">{t.moderation.users}</h1>
        <p className="m-0 mt-1 text-sm text-admin-muted">
          {users.length} {pluralizeRu(users.length, t.moderation.usersFoundCount)}
        </p>
      </div>

      <form method="get" className="flex flex-wrap gap-2">
        <Input type="text" name="q" defaultValue={q} placeholder={t.moderation.searchByEmail} className={FIELD_CLASS} />
        <Select name="role" defaultValue={role ?? ""} className={FIELD_CLASS}>
          <option value="">{t.common.all}</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {t.auth.roleNames[r]}
            </option>
          ))}
        </Select>
        <Button size="sm" type="submit" variant="admin" className="border-none bg-gradient-admin-cta">
          {t.common.search}
        </Button>
      </form>

      <div className="overflow-x-auto rounded-app border border-admin-border bg-admin-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-admin-card2 text-xs font-semibold uppercase tracking-wide text-admin-disabled">
            <tr>
              <th className="px-3 py-2.5 font-semibold">Имя</th>
              <th className="px-3 py-2.5 font-semibold">{t.auth.email}</th>
              <th className="px-3 py-2.5 font-semibold">{t.moderation.roleFilterLabel}</th>
              <th className="px-3 py-2.5 font-semibold">{t.moderation.registeredAt}</th>
              <th className="px-3 py-2.5 font-semibold">{t.moderation.lastLoginAt}</th>
              <th className="px-3 py-2.5 font-semibold">{t.moderation.statusLabel}</th>
              <th className="px-3 py-2.5 text-right font-semibold">Действия</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-admin-muted">
                  {t.moderation.noUsersFound}
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="border-t border-admin-border">
                  <td className="px-3 py-2.5 text-night-text">{u.dancer?.displayName ?? "—"}</td>
                  <td className="px-3 py-2.5 text-night-text">{u.email}</td>
                  <td className="px-3 py-2.5 text-admin-muted">{t.auth.roleNames[u.role]}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-admin-disabled">{u.createdAt.toLocaleDateString("ru-RU")}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-admin-disabled">
                    {u.lastLoginAt ? u.lastLoginAt.toLocaleString("ru-RU") : t.moderation.neverLoggedIn}
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusBadge
                      label={u.isBlocked ? t.moderation.statusBlocked : t.moderation.statusActive}
                      variant={u.isBlocked ? "danger" : "success"}
                    />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {u.id !== currentUser.id && <UserBlockToggle userId={u.id} isBlocked={u.isBlocked} />}
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
