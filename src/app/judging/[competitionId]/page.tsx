import { redirect } from "next/navigation";
import { getActor } from "@/server/rbac/actor";
import { getJudgeQueue, scoreQuotaForScale2, type JudgeQueueItem } from "@/server/judging/scoring";
import { listMyActiveFinalRounds } from "@/server/judging/final-scoring";
import { measureServerOperation } from "@/lib/performance-debug/server";
import { DomainError } from "@/server/errors";
import { ConfirmJudgingButton } from "@/components/admin/ConfirmJudgingButton";
import { JudgingQueueBanner } from "@/components/admin/judging/JudgingQueueBanner";
import { JudgeQueueRefresher } from "@/components/admin/judging/JudgeQueueRefresher";
import { JudgingRoundBoard } from "@/components/admin/judging/JudgingRoundBoard";
import { ContextBar } from "@/components/admin/judging/ContextBar";
import { ProgressBar } from "@/components/admin/judging/ProgressBar";
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
    <p className={`m-0 text-sm font-semibold ${over ? "text-red-400" : "text-admin-muted"}`}>
      Отметили {marked} из {total}
      {over && " — это больше, чем нужно"}
    </p>
  );
}

// Тот же смысл, что YesCounter, но для формата "0/1/2" (2026-09-07):
// судья должен поставить ровно twosNeeded оценок "2" и onesNeeded оценок
// "1" (scoreQuotaForScale2, scoring.ts) — числа считаются на сервере, здесь
// только сравнение с уже поставленным для подсветки.
function ScoreQuotaCounter({
  markedTwos,
  twosNeeded,
  markedOnes,
  onesNeeded,
}: {
  markedTwos: number;
  twosNeeded: number;
  markedOnes: number;
  onesNeeded: number;
}) {
  const off = markedTwos !== twosNeeded || markedOnes !== onesNeeded;
  return (
    <p className={`m-0 text-sm font-semibold ${off ? "text-red-400" : "text-admin-muted"}`}>
      Нужно «2»: {markedTwos} из {twosNeeded} · «1»: {markedOnes} из {onesNeeded}
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
          <p className="text-sm text-admin-muted">{e.userMessage}</p>
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
      <JudgeQueueRefresher />
      <h1 className="m-0 font-night text-xl font-extrabold text-night-text">Судейство</h1>
      <JudgingQueueBanner />
      {myFinalRounds.length > 0 && (
        <div className="flex flex-col gap-2">
          {myFinalRounds.map((r) => (
            <a
              key={r.roundId}
              href={`/judging/${competitionId}/final/${r.roundId}`}
              className="rounded-app border border-admin-primary/40 bg-admin-primary/10 p-3 text-sm font-semibold text-admin-primary no-underline"
            >
              Идёт финал «{r.divisionName}» — открыть судейство финала →
            </a>
          ))}
        </div>
      )}
      {skippedNotices.length > 0 && (
        <div className="flex flex-col gap-2">
          {skippedNotices.map((n) => (
            <p key={`${n.roundId}:${n.role}`} className="m-0 rounded-app border border-admin-border bg-admin-card p-3 text-sm text-admin-muted">
              {n.divisionName} · {ROLE_LABELS[n.role] ?? n.role} не оценивается в этом раунде — участников не больше, чем мест, все проходят
              автоматически.
            </p>
          ))}
        </div>
      )}
      {items.length === 0 && skippedNotices.length === 0 ? (
        <p className="text-sm text-admin-muted">Пока нет заходов, которые нужно оценить — вы не назначены судьёй ни на одну категорию, или заходы ещё не начались.</p>
      ) : (
        [...byRound.entries()].map(([roundId, roundItems]) => {
          const byHeat = new Map<string, JudgeQueueItem[]>();
          for (const item of roundItems) {
            const list = byHeat.get(item.heatId) ?? [];
            list.push(item);
            byHeat.set(item.heatId, list);
          }
          const heats = [...byHeat.values()]
            .map((list) => ({ heatId: list[0].heatId, heatNumber: list[0].heatNumber, items: list }))
            .sort((a, b) => a.heatNumber - b.heatNumber);
          const { maxValue, finalistsCount, divisionName, stageName } = roundItems[0];
          const roles = [...new Set(roundItems.map((i) => i.role))];
          const markedYes = roundItems.filter((i) => i.myScore === 1).length;
          const markedTwos = roundItems.filter((i) => i.myScore === 2).length;
          const markedOnes = roundItems.filter((i) => i.myScore === 1).length;
          const yesNoFormat = maxValue === 1 && finalistsCount > 0;
          const scale2Format = maxValue === 2 && finalistsCount > 0;
          const { twosNeeded, onesNeeded } = scoreQuotaForScale2(finalistsCount);
          const confirmed = confirmedSet.has(roundId);
          const pct = yesNoFormat
            ? finalistsCount > 0
              ? (markedYes / finalistsCount) * 100
              : 0
            : twosNeeded + onesNeeded > 0
              ? ((markedTwos + markedOnes) / (twosNeeded + onesNeeded)) * 100
              : 0;

          const footer =
            yesNoFormat || scale2Format ? (
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {yesNoFormat ? (
                    <YesCounter marked={markedYes} total={finalistsCount} />
                  ) : (
                    <ScoreQuotaCounter markedTwos={markedTwos} twosNeeded={twosNeeded} markedOnes={markedOnes} onesNeeded={onesNeeded} />
                  )}
                  {confirmed ? (
                    <span className="rounded-full border border-night-success/40 bg-night-success/10 px-3 py-1 text-sm font-semibold text-night-success">
                      ✓ Готово
                    </span>
                  ) : (
                    <ConfirmJudgingButton roundId={roundId} />
                  )}
                </div>
                <ProgressBar pct={pct} />
              </div>
            ) : null;

          return (
            <div key={roundId} className="flex flex-col gap-2">
              <ContextBar
                categoryLabel={`${divisionName} · ${roles.map((r) => ROLE_LABELS[r] ?? r).join(" / ")}`}
                stageLabel={stageName ?? undefined}
                quotaLabel={yesNoFormat || scale2Format ? `Отобрать ${finalistsCount} из ${roundItems.length}` : undefined}
              />
              <JudgingRoundBoard heats={heats} confirmed={confirmed} footer={footer} />
            </div>
          );
        })
      )}
    </div>
  );
}
