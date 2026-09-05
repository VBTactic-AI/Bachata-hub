import { redirect } from "next/navigation";
import { getActor } from "@/server/rbac/actor";
import { getJudgeQueue, type JudgeQueueItem } from "@/server/judging/scoring";
import { listMyActiveFinalRounds } from "@/server/judging/final-scoring";
import { measureServerOperation } from "@/lib/performance-debug/server";
import { DomainError } from "@/server/errors";
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
    <p className={`m-0 text-sm font-semibold ${over ? "text-red-400" : "text-night-muted"}`}>
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

  // CLAUDE.md §46: заход на эту страницу без назначения судьёй на это
  // соревнование (JudgeAssignment есть, а CompetitionMember нет — либо
  // человек просто ни разу не назначен судить) не должен ронять страницу
  // необработанным исключением — показываем ту же понятную причину, что
  // видит организатор при недостатке прав.
  let queue: { items: JudgeQueueItem[]; skippedNotices: { roundId: string; divisionName: string; role: JudgeQueueItem["role"] }[]; confirmedRoundIds: string[] };
  let myFinalRounds: Awaited<ReturnType<typeof listMyActiveFinalRounds>>;
  try {
    [queue, myFinalRounds] = await measureServerOperation("judge.open_page", () =>
      Promise.all([getJudgeQueue(competitionId), listMyActiveFinalRounds(competitionId)])
    );
  } catch (e) {
    if (e instanceof DomainError) {
      return (
        <div className="flex flex-col gap-3">
          <h1 className="m-0 font-night text-xl font-extrabold text-night-text">Судейство</h1>
          <p className="text-sm text-night-muted">{e.userMessage}</p>
        </div>
      );
    }
    throw e;
  }
  const { items, skippedNotices, confirmedRoundIds } = queue;
  const confirmedSet = new Set(confirmedRoundIds);

  const byRound = new Map<string, JudgeQueueItem[]>();
  for (const item of items) {
    const list = byRound.get(item.roundId) ?? [];
    list.push(item);
    byRound.set(item.roundId, list);
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="m-0 font-night text-xl font-extrabold text-night-text">Судейство</h1>
      <JudgingQueueBanner />
      {myFinalRounds.length > 0 && (
        <div className="flex flex-col gap-2">
          {myFinalRounds.map((r) => (
            <a
              key={r.roundId}
              href={`/judging/${competitionId}/final/${r.roundId}`}
              className="rounded-app border border-night-primary/40 bg-night-primary/10 p-3 text-sm font-semibold text-night-primary no-underline"
            >
              Идёт финал «{r.divisionName}» — открыть судейство финала →
            </a>
          ))}
        </div>
      )}
      {skippedNotices.length > 0 && (
        <div className="flex flex-col gap-2">
          {skippedNotices.map((n) => (
            <p key={`${n.roundId}:${n.role}`} className="m-0 rounded-app border border-night-border bg-night-card p-3 text-sm text-night-muted">
              {n.divisionName} · {ROLE_LABELS[n.role] ?? n.role} не оценивается в этом раунде — участников не больше, чем мест, все проходят
              автоматически.
            </p>
          ))}
        </div>
      )}
      {items.length === 0 && skippedNotices.length === 0 ? (
        <p className="text-sm text-night-muted">Пока нет заходов, которые нужно оценить — вы не назначены судьёй ни на один дивизион, или заходы ещё не начались.</p>
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
            <div key={roundId} className="flex flex-col gap-3">
              {yesNoFormat && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-app border border-night-border bg-night-card p-3">
                  <YesCounter marked={markedYes} total={finalistsCount} />
                  {confirmed ? (
                    <span className="rounded-full border border-night-success/40 bg-night-success/10 px-3 py-1 text-sm font-semibold text-night-success">
                      ✓ Готово — оценки зафиксированы
                    </span>
                  ) : (
                    <ConfirmJudgingButton roundId={roundId} />
                  )}
                </div>
              )}
              {[...byHeat.entries()].map(([heatId, list]) => (
                <div key={heatId} className="flex flex-col gap-3 rounded-app border border-night-border bg-night-card p-4">
                  <p className="m-0 text-xs font-semibold uppercase tracking-wide text-night-muted">
                    {list[0].divisionName} · заход {list[0].heatNumber}
                  </p>
                  <div className="flex flex-col gap-3">
                    {list.map((item) => (
                      <div key={item.drawParticipantId} className="flex flex-col gap-3 rounded-app-sm bg-night-card2 p-3">
                        <span className="text-base font-semibold text-night-text">
                          №{item.bibNumber ?? "—"} {item.displayName}
                        </span>
                        <JudgeScoreButtons
                          drawParticipantId={item.drawParticipantId}
                          maxValue={item.maxValue}
                          myScore={item.myScore}
                          locked={confirmed}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          );
        })
      )}
    </div>
  );
}
