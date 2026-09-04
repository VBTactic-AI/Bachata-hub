import { redirect } from "next/navigation";
import { getActor } from "@/server/rbac/actor";
import { getJudgeQueue } from "@/server/judging/scoring";
import { JudgeScoreButtons } from "@/components/admin/JudgeScoreButtons";

// Отдельный мобильный экран для судьи (CLAUDE.md §40) — не часть большой
// admin-страницы соревнования, чтобы не перегружать судью админскими
// функциями. Показывает только заходы дивизионов, на которые судья назначен
// (JudgeAssignment), и только его собственную роль.
export default async function JudgingPage({ params }: { params: Promise<{ competitionId: string }> }) {
  const { competitionId } = await params;
  const actor = await getActor();
  if (!actor) redirect("/login");

  const items = await getJudgeQueue(competitionId);
  const byHeat = new Map<string, typeof items>();
  for (const item of items) {
    const list = byHeat.get(item.heatId) ?? [];
    list.push(item);
    byHeat.set(item.heatId, list);
  }

  return (
    <div className="stack">
      <h1 className="page-title">Судейство</h1>
      {items.length === 0 ? (
        <p className="hint-text">Пока нет заходов, которые нужно оценить — вы не назначены судьёй ни на один дивизион, или заходы ещё не начались.</p>
      ) : (
        [...byHeat.entries()].map(([heatId, list]) => (
          <div key={heatId} className="rounded-app-sm border border-line p-3">
            <p className="hint-text">
              {list[0].divisionName} · заход {list[0].heatNumber}
            </p>
            <ul className="stack gap-2 mt-2">
              {list.map((item) => (
                <li key={item.drawParticipantId} className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    №{item.bibNumber ?? "—"} {item.displayName}
                  </span>
                  <JudgeScoreButtons drawParticipantId={item.drawParticipantId} maxValue={item.maxValue} myScore={item.myScore} />
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}
