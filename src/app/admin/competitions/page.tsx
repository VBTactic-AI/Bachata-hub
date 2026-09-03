import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getActor } from "@/server/rbac/actor";
import { can } from "@/server/rbac/authorize";
import { buttonVariants } from "@/components/ui/button";
import { cardVariants } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { COMPETITION_STATUS_LABELS as STATUS_LABELS } from "@/lib/competition-labels";

export default async function CompetitionsPage() {
  const actor = await getActor();
  if (!actor) redirect("/login");

  const isSuperAdmin = can(actor, "competition:create");
  // Не только "свои" соревнования — иначе танцор, который ещё никуда не
  // регистрировался, вообще не может узнать, что открыта регистрация
  // (некуда было бы кликнуть, чтобы записаться в первый раз).
  const competitions = isSuperAdmin
    ? await prisma.competition.findMany({ orderBy: { createdAt: "desc" } })
    : await prisma.competition.findMany({
        where: {
          OR: [{ members: { some: { userId: actor.userId } } }, { status: "REGISTRATION_OPEN" }],
        },
        orderBy: { createdAt: "desc" },
      });

  return (
    <div className="stack">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Соревнования</h1>
        {isSuperAdmin && (
          <Link href="/admin/competitions/new" className={buttonVariants({ className: "no-underline" })}>
            + Новое соревнование
          </Link>
        )}
      </div>

      {competitions.length === 0 ? (
        <p className="hint-text">Пока нет ни одного соревнования.</p>
      ) : (
        <div className="card-grid">
          {competitions.map((c) => (
            <Link
              key={c.id}
              href={`/admin/competitions/${c.id}`}
              className={cardVariants({ interactive: true, className: "no-underline" })}
            >
              <strong className="text-ink">{c.name}</strong>
              <p className="mt-1.5">
                <Badge variant="community">{STATUS_LABELS[c.status] ?? c.status}</Badge>
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
