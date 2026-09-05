import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/server/rbac/actor";
import { can } from "@/server/rbac/authorize";
import { isAdmin, getCurrentUser } from "@/lib/auth";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { COMPETITION_STATUS_LABELS as STATUS_LABELS } from "@/lib/competition-labels";

// Панель управления /admin — раньше в разделе не было общего "входа": сразу
// список соревнований без сводки (найдено пользователем 07.09.2026). Та же
// область видимости, что и в /admin/competitions (isSuperAdmin — все
// соревнования, иначе только свои + открытые для регистрации), чтобы цифры
// на панели не показывали то, что человек не может открыть по ссылке рядом.
export default async function AdminDashboardPage() {
  const actor = await getActor();
  if (!actor) redirect("/login");
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
        <Card className="border-night-border bg-night-card">
          <p className="m-0 text-sm text-night-muted">Всего соревнований</p>
          <p className="m-0 mt-1 text-3xl font-extrabold text-night-text">{competitions.length}</p>
        </Card>
        <Card className="border-night-border bg-night-card">
          <p className="m-0 text-sm text-night-muted">Регистрация открыта</p>
          <p className="m-0 mt-1 text-3xl font-extrabold text-night-primary">{open}</p>
        </Card>
        <Card className="border-night-border bg-night-card">
          <p className="m-0 text-sm text-night-muted">Идут сейчас</p>
          <p className="m-0 mt-1 text-3xl font-extrabold text-night-pink">{live}</p>
        </Card>
      </div>

      {competitions.length > 0 && (
        <div>
          <h2 className="m-0 mb-2 font-night text-base font-bold text-night-text">По статусам</h2>
          <div className="flex flex-wrap gap-2">
            {[...byStatus.entries()].map(([status, count]) => (
              <span key={status} className="rounded-full bg-night-card2 px-3 py-1.5 text-sm font-semibold text-night-pink">
                {STATUS_LABELS[status] ?? status}: {count}
              </span>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="m-0 mb-2 font-night text-base font-bold text-night-text">Разделы</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Link
            href="/admin/competitions"
            className={buttonVariants({
              variant: "outline",
              className: "border-night-border bg-transparent text-night-text no-underline hover:border-night-primary hover:text-night-text",
            })}
          >
            Соревнования →
          </Link>
          {isAdmin(user) && (
            <>
              <Link
                href="/admin/division-categories"
                className={buttonVariants({
                  variant: "outline",
                  className: "border-night-border bg-transparent text-night-text no-underline hover:border-night-primary hover:text-night-text",
                })}
              >
                Категории →
              </Link>
              <Link
                href="/admin/round-stages"
                className={buttonVariants({
                  variant: "outline",
                  className: "border-night-border bg-transparent text-night-text no-underline hover:border-night-primary hover:text-night-text",
                })}
              >
                Этапы отбора →
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
