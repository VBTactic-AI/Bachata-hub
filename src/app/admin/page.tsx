import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, isAdmin, canCreateEvents } from "@/lib/auth";
import { getActor } from "@/server/rbac/actor";
import { can, hasNoAdminAccess } from "@/server/rbac/authorize";
import { prisma } from "@/lib/prisma";
import { AdminSectionShell } from "@/components/admin/AdminSectionShell";
import { cardVariants } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { HomeIcon, TrophyIcon, ContentIcon, SchoolIcon, FestivalIcon } from "@/components/admin/nav-shared";

// Хаб-пикер — точка входа /admin. Пять отдельных админок
// (Мониторинг/Ивенты/Соревнования/Школа/Фестивали, docs/00_DECISIONS.md,
// 2026-09-14): доступ к каждой проверяется независимо. У кого доступ ровно к
// одной — сразу редирект туда, без лишнего клика. У кого к нескольким (типично
// только у SUPER_ADMIN) — карточки выбора. У кого ни к одной — как и раньше
// (hasNoAdminAccess), редирект на публичный сайт.
export default async function AdminHubPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const actor = await getActor();
  if (!actor || hasNoAdminAccess(actor)) redirect("/");

  const school = await prisma.school.findFirst({ where: { ownerUserId: user.id }, select: { id: true } });

  const sections = [
    { key: "system", href: "/admin/system", label: "Мониторинг", desc: "Главная, модерация, оповещения, БД — вся платформа", icon: <HomeIcon />, has: isAdmin(user) },
    { key: "content", href: "/admin/content", label: "Ивенты", desc: "Создание и ведение своих мероприятий", icon: <ContentIcon />, has: canCreateEvents(user) },
    {
      key: "competitions",
      href: "/admin/competitions",
      label: "Соревнования",
      desc: "Создание и проведение Jack & Jill",
      icon: <TrophyIcon />,
      has: isAdmin(user) || can(actor, "competition:create") || (actor?.permissionsByCompetition.size ?? 0) > 0,
    },
    { key: "school", href: "/admin/school", label: "Школа", desc: "CRM и карточка своей школы", icon: <SchoolIcon />, has: !!school },
    { key: "festival", href: "/admin/festival", label: "Фестивали", desc: "Доступ к системе ведения фестивалей", icon: <FestivalIcon />, has: user.isVerifiedFestivalOrganizer },
  ];

  const available = sections.filter((s) => s.has);

  if (available.length === 0) redirect("/");
  if (available.length === 1) redirect(available[0].href);

  return (
    <AdminSectionShell sidebar={null}>
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="m-0 font-night text-xl font-extrabold text-night-text sm:text-2xl">Выберите админку</h1>
          <p className="m-0 mt-1 text-sm text-admin-muted">У вас есть доступ к нескольким разделам управления.</p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {available.map((s) => (
            <Link
              key={s.key}
              href={s.href}
              className={cn(cardVariants({ interactive: true }), "flex flex-col gap-2 border-admin-border bg-admin-card no-underline hover:border-admin-primary/60")}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-admin-primary/15 text-admin-primary">{s.icon}</span>
              <strong className="text-night-text">{s.label}</strong>
              <span className="text-sm text-admin-muted">{s.desc}</span>
            </Link>
          ))}
        </div>
      </div>
    </AdminSectionShell>
  );
}
