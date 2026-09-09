import { redirect } from "next/navigation";
import Link from "next/link";
import { getActor } from "@/server/rbac/actor";
import { can } from "@/server/rbac/authorize";
import { prisma } from "@/lib/prisma";
import { getFinalScoreMonitor, getPrelimScoreMonitor } from "@/server/judging/score-monitor";
import { FinalScoreMonitor, PrelimScoreMonitor } from "@/components/admin/ScoreMonitorTable";

// Live-таблица оценок для head judge/admin (промт пользователя, 2026-09-07):
// доступ — то же право score:view_all, что уже разрешает "видеть все оценки"
// (выдано EVENT_ADMIN/HEAD_JUDGE/SCORER, НЕ выдано JUDGE — prisma/seed-layer3.ts).
export default async function ScoreMonitorPage({ params }: { params: Promise<{ id: string; roundId: string }> }) {
  const { id: competitionId, roundId } = await params;
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (!can(actor, "score:view_all", competitionId)) redirect(`/admin/competitions/${competitionId}`);

  const round = await prisma.round.findUniqueOrThrow({
    where: { id: roundId },
    select: {
      divisionId: true,
      division: { select: { competitionId: true, category: { select: { name: true } } } },
      stage: { select: { name: true } },
      finalSession: { select: { id: true } },
    },
  });
  if (round.division.competitionId !== competitionId) redirect(`/admin/competitions/${competitionId}`);

  // Назад — сразу на вкладку "Монитор", на ту же категорию и этап (по
  // прямому запросу пользователя, 2026-09-09), а не на вкладку по умолчанию
  // ("Основное"): CompetitionWorkspaceTabs/CompetitionMonitor читают эти
  // query-параметры один раз при монтировании.
  const backHref = `/admin/competitions/${competitionId}?tab=monitor&category=${round.divisionId}&round=${roundId}`;

  const isFinal = !!round.finalSession;
  const prelim = isFinal ? null : await getPrelimScoreMonitor(roundId);
  const final = isFinal ? await getFinalScoreMonitor(roundId) : null;

  return (
    <main className="stack gap-4">
      <div>
        <Link href={backHref} className="hint-text">
          &larr; Назад к соревнованию
        </Link>
        <h1 className="text-xl font-semibold mt-1">
          Онлайн-монитор оценок — {round.division.category.name}
          {round.stage?.name ? ` · ${round.stage.name}` : ""}
        </h1>
      </div>
      {prelim && (
        <PrelimScoreMonitor
          roundId={roundId}
          maxValue={prelim.maxValue}
          finalistsCount={prelim.finalistsCount}
          initialLeader={prelim.leader}
          initialFollower={prelim.follower}
        />
      )}
      {final && <FinalScoreMonitor roundId={roundId} format={final.format} initialLeader={final.leader} initialFollower={final.follower} />}
      {!prelim && !final && <p className="hint-text">Для этого раунда финал ещё не начат — данных пока нет.</p>}
    </main>
  );
}
