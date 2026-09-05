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
    <div className="stack">
      <h1 className="page-title">Панель управления</h1>

      <div className="card-grid">
        <Card>
          <p className="hint-text m-0">Всего соревнований</p>
          <p className="m-0 mt-1 text-3xl font-extrabold text-ink">{competitions.length}</p>
        </Card>
        <Card>
          <p className="hint-text m-0">Регистрация открыта</p>
          <p className="m-0 mt-1 text-3xl font-extrabold text-primary">{open}</p>
        </Card>
        <Card>
          <p className="hint-text m-0">Идут сейчас</p>
          <p className="m-0 mt-1 text-3xl font-extrabold text-accent">{live}</p>
        </Card>
      </div>

      {competitions.length > 0 && (
        <div>
          <h2 className="page-title">По статусам</h2>
          <div className="flex flex-wrap gap-2">
            {[...byStatus.entries()].map(([status, count]) => (
              <span key={status} className="rounded-full bg-primary-light px-3 py-1.5 text-sm font-semibold text-primary-dark">
                {STATUS_LABELS[status] ?? status}: {count}
              </span>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="page-title">Разделы</h2>
        <div className="card-grid">
          <Link href="/admin/competitions" className={buttonVariants({ variant: "outline", className: "no-underline" })}>
            Соревнования →
          </Link>
          {isAdmin(user) && (
            <>
              <Link href="/admin/division-categories" className={buttonVariants({ variant: "outline", className: "no-underline" })}>
                Категории →
              </Link>
              <Link href="/admin/round-stages" className={buttonVariants({ variant: "outline", className: "no-underline" })}>
                Этапы отбора →
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
