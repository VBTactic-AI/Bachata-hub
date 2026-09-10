import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/server/rbac/actor";
import { can, isJudgeOnlyActor } from "@/server/rbac/authorize";
import { isAdmin, getCurrentUser } from "@/lib/auth";
import { buttonVariants } from "@/components/ui/button";
import { StatCard } from "@/components/admin/StatCard";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { COMPETITION_STATUS_LABELS as STATUS_LABELS } from "@/lib/competition-labels";
import { cn } from "@/lib/cn";

// Панель управления /admin — раньше в разделе не было общего "входа": сразу
// список соревнований без сводки (найдено пользователем 07.09.2026). Та же
// область видимости, что и в /admin/competitions (isSuperAdmin — все
// соревнования, иначе только свои + открытые для регистрации), чтобы цифры
// на панели не показывали то, что человек не может открыть по ссылке рядом.
export default async function AdminDashboardPage() {
  const actor = await getActor();
  if (!actor) redirect("/login");
  // Судья — только судья, без каких-либо других ролей — не должен видеть
  // "Панель управления" вообще (CLAUDE.md §40/§52, жалоба пользователя,
  // 2026-09-10): у него нет ни одной причины сюда заходить, его место —
  // прямая ссылка на /judging/[competitionId], которую даёт организатор.
  if (isJudgeOnlyActor(actor)) redirect("/");
  const user = await getCurrentUser();

  const isSuperAdmin = can(actor, "competition:create");

  const competitions = await prisma.competition.findMany({
    where: isSuperAdmin
      ? undefined
      : { OR: [{ members: { some: { userId: actor.userId } } }, { status: "REGISTRATION_OPEN" }] },
    select: { status: true },
  });

  const byStatus = new Map<string, number>();
  for (const c of competitions) {
    byStatus.set(c.status, (byStatus.get(c.status) ?? 0) + 1);
  }
  const live = (byStatus.get("LIVE") ?? 0) + (byStatus.get("SCORING") ?? 0);
  const open = byStatus.get("REGISTRATION_OPEN") ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="m-0 font-night text-xl font-extrabold text-night-text sm:text-3xl">Панель управления</h1>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Всего соревнований" value={competitions.length} />
        <StatCard label="Регистрация открыта" value={open} accent />
        <StatCard label="Идут сейчас" value={live} accent />
      </div>

      {competitions.length > 0 && (
        <div>
          <h2 className="m-0 mb-2 font-night text-base font-bold text-night-text">По статусам</h2>
          <div className="flex flex-wrap gap-2">
            {[...byStatus.entries()].map(([status, count]) => (
              <StatusBadge key={status} label={`${STATUS_LABELS[status] ?? status}: ${count}`} variant="neutral" />
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="m-0 mb-2 font-night text-base font-bold text-night-text">Разделы</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Link href="/admin/competitions" className={cn(buttonVariants({ variant: "adminOutline" }), "no-underline")}>
            Соревнования →
          </Link>
          {isAdmin(user) && (
            <>
              <Link href="/admin/division-categories" className={cn(buttonVariants({ variant: "adminOutline" }), "no-underline")}>
                Категории →
              </Link>
              <Link href="/admin/round-stages" className={cn(buttonVariants({ variant: "adminOutline" }), "no-underline")}>
                Этапы отбора →
              </Link>
              <Link href="/admin/judging-criteria" className={cn(buttonVariants({ variant: "adminOutline" }), "no-underline")}>
                Оценочные показатели →
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
