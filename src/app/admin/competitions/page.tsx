import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/server/rbac/actor";
import { can, hasStaffAccessToCompetition } from "@/server/rbac/authorize";
import { buttonVariants } from "@/components/ui/button";
import { cardVariants } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { COMPETITION_STATUS_LABELS as STATUS_LABELS } from "@/lib/competition-labels";

export default async function CompetitionsPage() {
  const actor = await getActor();
  if (!actor) redirect("/login");

  const isSuperAdmin = can(actor, "competition:create");
  // Рабочий инструмент организатора/персонала — только СВОИ соревнования, где
  // реально назначен штатно (EVENT_ADMIN/HEAD_JUDGE/SCORER/DJ/MC), не любое
  // членство (рядовой COMPETITOR исключён, hasStaffAccessToCompetition) и не
  // "у кого угодно открыта регистрация" (для этого — публичная витрина
  // /compete, уточнено пользователем, 2026-09-14 — раньше сюда ошибочно
  // попадал и рядовой танцор).
  const staffCompetitionIds = [...actor.permissionsByCompetition.keys()].filter((id) =>
    hasStaffAccessToCompetition(actor, id)
  );
  const competitions = isSuperAdmin
    ? await prisma.competition.findMany({ orderBy: { createdAt: "desc" } })
    : await prisma.competition.findMany({
        where: { id: { in: staffCompetitionIds } },
        orderBy: { createdAt: "desc" },
      });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="m-0 font-night text-xl font-extrabold text-night-text sm:text-3xl">Соревнования</h1>
        {isSuperAdmin && (
          <Link href="/admin/competitions/new" className={cn(buttonVariants({ variant: "admin" }), "no-underline")}>
            + Новое соревнование
          </Link>
        )}
      </div>

      {competitions.length === 0 ? (
        <p className="text-sm text-admin-muted">Пока нет ни одного соревнования.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {competitions.map((c) => (
            <Link
              key={c.id}
              href={`/admin/competitions/${c.id}`}
              className={cn(
                cardVariants({ interactive: true }),
                "border-admin-border bg-admin-card no-underline hover:border-admin-primary/60 hover:shadow-none"
              )}
            >
              <strong className="text-night-text">{c.name}</strong>
              <p className="mt-1.5">
                <Badge variant="community" className="bg-admin-card2 text-admin-primaryHover">
                  {STATUS_LABELS[c.status] ?? c.status}
                </Badge>
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
