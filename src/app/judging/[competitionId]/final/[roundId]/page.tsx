import { redirect } from "next/navigation";
import { getActor } from "@/server/rbac/actor";
import { getFinalJudgeQueue } from "@/server/judging/final-scoring";
import { FinalJudgingScreen } from "@/components/admin/judging/FinalJudgingScreen";
import { measureServerOperation } from "@/lib/performance-debug/server";

// Отдельный мобильный экран для судьи финала (CLAUDE.md §40) — не смешан с
// обычной /judging/[competitionId] (там другая модель оценки — один балл на
// участника, не несколько критериев).
export default async function FinalJudgingPage({ params }: { params: Promise<{ competitionId: string; roundId: string }> }) {
  const { competitionId, roundId } = await params;
  const actor = await getActor();
  if (!actor) redirect("/login");

  const queue = await measureServerOperation("judge.open_final_page", () => getFinalJudgeQueue(competitionId, roundId));
  if (!queue) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="m-0 font-night text-xl font-extrabold text-night-text">Судейство финала</h1>
        <p className="text-sm text-night-muted">Финал ещё не начат для этого раунда, либо вы не назначены судьёй в этом дивизионе.</p>
        <a href={`/judging/${competitionId}`} className="text-sm text-night-primary">
          ← Ко всем заходам
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <a href={`/judging/${competitionId}`} className="text-sm text-night-muted">
        ← Ко всем заходам
      </a>
      <h1 className="m-0 font-night text-xl font-extrabold text-night-text">Финал · {queue.divisionName}</h1>
      <FinalJudgingScreen criteria={queue.criteria} items={queue.items} />
    </div>
  );
}
