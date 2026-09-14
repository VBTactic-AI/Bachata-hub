import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getActor } from "@/server/rbac/actor";
import { getAdminSectionAccess } from "@/lib/admin-access";
import { AdminSectionShell } from "@/components/admin/AdminSectionShell";
import { cardVariants } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { HomeIcon, TrophyIcon, ContentIcon, SchoolIcon, FestivalIcon } from "@/components/admin/nav-shared";

// Хаб-пикер — точка входа /admin. Пять отдельных админок
// (Мониторинг/Ивенты/Соревнования/Школа/Фестивали, docs/00_DECISIONS.md,
// 2026-09-14): доступ к каждой проверяется независимо через
// getAdminSectionAccess() (общий источник и для этой страницы, и для кнопки
// "Админ панель" на /profile). У кого доступ ровно к одной — сразу редирект
// туда, без лишнего клика. У кого к нескольким (типично только у
// SUPER_ADMIN) — карточки выбора. У кого ни к одной — редирект на публичный
// сайт.
//
// Раньше здесь ДОПОЛНИТЕЛЬНО стоял ранний гейт hasNoAdminAccess(actor) — он
// смотрит только на RBAC-права слоя 3 (соревнования) и ничего не знает про
// isVerifiedEventOrganizer/владение школой/isVerifiedFestivalOrganizer:
// человек ТОЛЬКО с одним из этих трёх доступов (без единого права в
// движке соревнований) им ошибочно выкидывался на "/" ещё до того, как
// вообще успевали посчитаться sections ниже (найдено при добавлении кнопки
// "Админ панель" на профиль, 2026-09-14). Убран — sections/available.length
// уже сами по себе полный и единственный гейт.
export default async function AdminHubPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const actor = await getActor();
  const access = await getAdminSectionAccess(user, actor);

  const sections = [
    { key: "system", href: "/admin/system", label: "Мониторинг", desc: "Главная, модерация, оповещения, БД — вся платформа", icon: <HomeIcon />, has: access.system },
    { key: "content", href: "/admin/content", label: "Ивенты", desc: "Создание и ведение своих мероприятий", icon: <ContentIcon />, has: access.content },
    { key: "competitions", href: "/admin/competitions", label: "Соревнования", desc: "Создание и проведение Jack & Jill", icon: <TrophyIcon />, has: access.competitions },
    { key: "school", href: "/admin/school", label: "Школа", desc: "CRM и карточка своей школы", icon: <SchoolIcon />, has: access.school },
    { key: "festival", href: "/admin/festival", label: "Фестивали", desc: "Доступ к системе ведения фестивалей", icon: <FestivalIcon />, has: access.festival },
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
