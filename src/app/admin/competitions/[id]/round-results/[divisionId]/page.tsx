import { redirect } from "next/navigation";
import Link from "next/link";
import { getActor } from "@/server/rbac/actor";
import { can } from "@/server/rbac/authorize";
import { prisma } from "@/lib/prisma";
import { ROUND_TYPE_LABELS } from "@/lib/competition-labels";
import { RoundResultsTabs, type RoundResultsRound } from "@/components/admin/RoundResultsTabs";

// Отдельная справочная страница "Результаты этапов" (redesign 2026-09-09, по
// прямому запросу пользователя — кнопка рядом с "Монитор оценок судей" в
// JudgesLivePanel.tsx): вкладки этапов категории, под каждой — тот же список
// "прошёл/не прошёл", что уже есть в панели раунда Монитора (RoundResultsList,
// вынесен в общий компонент, чтобы не дублировать разметку). Доступ — тот же
// гейт, что открывает саму вкладку "Монитор" целиком (round:create — есть у
// SUPER_ADMIN и EVENT_ADMIN, но не у HEAD_JUDGE/JUDGE/SCORER/DJ/MC, см.
// prisma/seed-layer3.ts), по прямому решению пользователя эта страница — не
// для судейского состава.
export default async function RoundResultsPage({
  params,
}: {
  params: Promise<{ id: string; divisionId: string }>;
}) {
  const { id: competitionId, divisionId } = await params;
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (!can(actor, "round:create", competitionId)) redirect(`/admin/competitions/${competitionId}`);

  const division = await prisma.division.findUniqueOrThrow({
    where: { id: divisionId },
    select: {
      competitionId: true,
      category: { select: { name: true } },
      rounds: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          order: true,
          type: true,
          status: true,
          stage: { select: { name: true } },
          finalSession: { select: { id: true } },
          results: {
            orderBy: { rank: "asc" },
            select: {
              id: true,
              scoreSum: true,
              status: true,
              registration: {
                select: {
                  role: true,
                  checkIn: { select: { bibNumber: true } },
                  dancer: { select: { displayName: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (division.competitionId !== competitionId) redirect(`/admin/competitions/${competitionId}`);

  // Финал — последний по order обычный (не служебный, type === null) раунд
  // категории (тот же признак, что и isFinalRound в page.tsx/advancement.ts).
  const rounds: RoundResultsRound[] = division.rounds.map((round) => ({
    id: round.id,
    name: round.stage?.name ?? (round.type ? (ROUND_TYPE_LABELS[round.type] ?? round.type) : "—"),
    status: round.status,
    isFinalRound: round.type === null && !division.rounds.some((r) => r.type === null && r.order > round.order),
    results: round.results,
  }));

  // Назад — сразу на вкладку "Монитор", на ту же категорию (по тому же
  // принципу, что и score-monitor/[roundId]/page.tsx: F5/переход не должен
  // сбрасывать на вкладку по умолчанию).
  const backHref = `/admin/competitions/${competitionId}?tab=monitor&category=${divisionId}`;

  return (
    <main className="stack gap-4">
      <div>
        <Link href={backHref} className="text-sm font-semibold text-admin-muted hover:text-admin-primaryHover">
          &larr; Назад к соревнованию
        </Link>
        <h1 className="m-0 mt-1 text-xl font-extrabold text-night-text">Результаты этапов — {division.category.name}</h1>
      </div>
      <RoundResultsTabs rounds={rounds} />
    </main>
  );
}
