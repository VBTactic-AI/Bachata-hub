import { redirect } from "next/navigation";
import { getActor } from "@/server/rbac/actor";
import { getJudgeQueue, type JudgeQueueItem } from "@/server/judging/scoring";
import { listMyActiveFinalRounds } from "@/server/judging/final-scoring";
import { measureServerOperation } from "@/lib/performance-debug/server";
import { JudgeScoreButtons } from "@/components/admin/JudgeScoreButtons";
import { ConfirmJudgingButton } from "@/components/admin/ConfirmJudgingButton";
import { JudgingQueueBanner } from "@/components/admin/judging/JudgingQueueBanner";
import { REGISTRATION_ROLE_LABELS as ROLE_LABELS } from "@/lib/competition-labels";

// "Отметили X из N" — сколько "Да" судья уже поставил в этом раунде из
// N (Round.finalistsCount для его роли), только для формата 0/1 (по запросу
// пользователя, 2026-09-04). Подсказка, не запрет — судьи независимы, сумма
// баллов ВСЕХ судей решает cutoff, а не то, сколько "да" у одного судьи;
// поэтому подсвечиваем цветом, но не блокируем кнопки при превышении.
// Раунд не завершается сам по достижении N — только по явному "Готово"
// (ConfirmJudgingButton) от каждого судьи (2026-09-04).
function YesCounter({ marked, total }: { marked: number; total: number }) {
  const over = marked > total;
  return (
    <p className={`m-0 text-sm font-semibold ${over ? "error-text" : "hint-text"}`}>
      Отметили {marked} из {total}
      {over && " — это больше, чем нужно"}
    </p>
  );
}

// Отдельный мобильный экран для судьи (CLAUDE.md §40) — не часть большой
// admin-страницы соревнования, чтобы не перегружать судью админскими
// функциями. Показывает только заходы дивизионов, на которые судья назначен
// (JudgeAssignment), и только его собственную роль.
export default async function JudgingPage({ params }: { params: Promise<{ competitionId: string }> }) {
  const { competitionId } = await params;
  const actor = await getActor();
  if (!actor) redirect("/login");

  const [{ items, skippedNotices, confirmedRoundIds }, myFinalRounds] = await measureServerOperation("judge.open_page", () =>
    Promise.all([getJudgeQueue(competitionId), listMyActiveFinalRounds(competitionId)])
  );
  const confirmedSet = new Set(confirmedRoundIds);

  const byRound = new Map<string, JudgeQueueItem[]>();
  for (const item of items) {
    const list = byRound.get(item.roundId) ?? [];
    list.push(item);
    byRound.set(item.roundId, list);
  }

  return (
    <div className="stack">
      <h1 className="page-title">Судейство</h1>
      <JudgingQueueBanner />
      {myFinalRounds.length > 0 && (
        <div className="stack gap-1">
          {myFinalRounds.map((r) => (
            <p key={r.roundId} className="hint-text rounded-app-sm border border-line p-2">
              Идёт финал «{r.divisionName}» — <a href={`/judging/${competitionId}/final/${r.roundId}`}>открыть судейство финала →</a>
            </p>
          ))}
        </div>
      )}
      {skippedNotices.length > 0 && (
        <div className="stack gap-1">
          {skippedNotices.map((n) => (
            <p key={`${n.roundId}:${n.role}`} className="hint-text rounded-app-sm border border-line p-2">
              {n.divisionName} · {ROLE_LABELS[n.role] ?? n.role} не оценивается в этом раунде — участников не больше, чем мест, все проходят
              автоматически.
            </p>
          ))}
        </div>
      )}
      {items.length === 0 && skippedNotices.length === 0 ? (
        <p className="hint-text">Пока нет заходов, которые нужно оценить — вы не назначены судьёй ни на один дивизион, или заходы ещё не начались.</p>
      ) : (
        [...byRound.entries()].map(([roundId, roundItems]) => {
          const byHeat = new Map<string, JudgeQueueItem[]>();
          for (const item of roundItems) {
            const list = byHeat.get(item.heatId) ?? [];
            list.push(item);
            byHeat.set(item.heatId, list);
          }
          const { maxValue, finalistsCount } = roundItems[0];
          const markedYes = roundItems.filter((i) => i.myScore === 1).length;
          const yesNoFormat = maxValue === 1 && finalistsCount > 0;
          const confirmed = confirmedSet.has(roundId);

          return (
            <div key={roundId} className="stack gap-2">
              {yesNoFormat && (
                <div className="flex flex-wrap items-center gap-2">
                  <YesCounter marked={markedYes} total={finalistsCount} />
                  {confirmed ? (
                    <span className="hint-text rounded-full border border-line px-2 py-0.5">✓ Готово — оценки зафиксированы</span>
                  ) : (
                    <ConfirmJudgingButton roundId={roundId} />
                  )}
                </div>
              )}
              {[...byHeat.entries()].map(([heatId, list]) => (
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
                        <JudgeScoreButtons
                          drawParticipantId={item.drawParticipantId}
                          maxValue={item.maxValue}
                          myScore={item.myScore}
                          locked={confirmed}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          );
        })
      )}
    </div>
  );
}
