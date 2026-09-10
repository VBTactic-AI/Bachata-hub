import { redirect } from "next/navigation";
import { getActor } from "@/server/rbac/actor";
import { getJudgeQueue, scoreQuotaForScale2, type JudgeQueueItem } from "@/server/judging/scoring";
import { getFinalJudgeQueue } from "@/server/judging/final-scoring";
import { getJudgeDivisionsOverview } from "@/server/judging/judge-overview";
import { measureServerOperation } from "@/lib/performance-debug/server";
import { DomainError } from "@/server/errors";
import { ConfirmJudgingButton } from "@/components/admin/ConfirmJudgingButton";
import { JudgingQueueBanner } from "@/components/admin/judging/JudgingQueueBanner";
import { JudgeQueueRefresher } from "@/components/admin/judging/JudgeQueueRefresher";
import { JudgingRoundBoard } from "@/components/admin/judging/JudgingRoundBoard";
import { ContextBar } from "@/components/admin/judging/ContextBar";
import { ProgressBar } from "@/components/admin/judging/ProgressBar";
import { FinalJudgingScreen } from "@/components/admin/judging/FinalJudgingScreen";
import { JudgeCategoryTabs, type JudgeCategoryTab, type JudgeStageTab } from "@/components/admin/judging/JudgeCategoryTabs";
import { REGISTRATION_ROLE_LABELS as ROLE_LABELS } from "@/lib/competition-labels";

const NOT_STARTED_STATUSES = new Set(["DRAFT", "READY", "DRAWING", "DRAW_LOCKED"]);

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

// Обычный (не финальный) раунд — тот же рендер, что раньше был единственным
// содержимым страницы, теперь — содержимое ОДНОЙ вкладки "Этап" внутри
// категории (2026-09-10, редизайн навигации судьи по прямому запросу
// пользователя).
function renderRegularRoundContent(roundId: string, roundItems: JudgeQueueItem[], confirmed: boolean) {
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
    <div className="flex flex-col gap-2">
      <ContextBar
        categoryLabel={`${divisionName} · ${roles.map((r) => ROLE_LABELS[r] ?? r).join(" / ")}`}
        stageLabel={stageName ?? undefined}
        quotaLabel={yesNoFormat || scale2Format ? `Отобрать ${finalistsCount} из ${roundItems.length}` : undefined}
      />
      <JudgingRoundBoard heats={heats} confirmed={confirmed} footer={footer} />
    </div>
  );
}

// Отдельный мобильный экран для судьи (CLAUDE.md §40) — не часть большой
// admin-страницы соревнования, чтобы не перегружать судью админскими
// функциями. Показывает только категории, на которые судья назначен
// (JudgeAssignment), и только его собственную роль.
//
// Редизайн навигации (2026-09-10, по прямому запросу пользователя): раньше
// все обычные раунды рисовались одним сплошным полотном, а финалы были
// отдельными карточками-ссылками на отдельный URL — без группировки по
// категориям и без возможности увидеть всю сетку этапов сразу. Теперь —
// категория (вкладка) → этап (вкладка) → сама оценка, всё на одной
// странице, без переходов (тот же приём, что и вкладки заходов в "Танце с
// судьями", JudgesDanceDrawPanel.tsx/FinalJudgingScreen.tsx). Этапы,
// которые ещё не начались, тоже видны (просто неактивны) — судья видит всю
// сетку категории целиком; уже оценённые/подтверждённые помечены "✓",
// текущий — точкой "идёт" (по прямому решению пользователя).
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
  let divisions: Awaited<ReturnType<typeof getJudgeDivisionsOverview>>;
  try {
    [queue, divisions] = await measureServerOperation("judge.open_page", () =>
      Promise.all([getJudgeQueue(competitionId), getJudgeDivisionsOverview(competitionId)])
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
  const skippedByRound = new Map<string, typeof skippedNotices>();
  for (const n of skippedNotices) {
    const list = skippedByRound.get(n.roundId) ?? [];
    list.push(n);
    skippedByRound.set(n.roundId, list);
  }

  // Финалы — отдельный запрос НА КАЖДЫЙ (судья обычно назначен на 1-2
  // категории, максимум по одному финалу в каждой — цена мала), в отличие
  // от обычных раундов, где один getJudgeQueue уже отдаёт все items сразу.
  const finalRoundIds = divisions.flatMap((d) => d.rounds.filter((r) => r.isFinal).map((r) => r.roundId));
  const finalQueues = await measureServerOperation("judge.open_page.finals", () =>
    Promise.all(finalRoundIds.map((roundId) => getFinalJudgeQueue(competitionId, roundId)))
  );
  const finalQueueByRoundId = new Map(finalRoundIds.map((id, i) => [id, finalQueues[i]]));

  const categories: JudgeCategoryTab[] = divisions.map((d) => {
    const stages: JudgeStageTab[] = d.rounds.map((r) => {
      if (NOT_STARTED_STATUSES.has(r.status)) {
        return {
          roundId: r.roundId,
          label: r.label,
          status: "NOT_STARTED",
          content: <p className="m-0 text-sm text-admin-muted">Этот этап ещё не начался.</p>,
        };
      }

      if (r.isFinal) {
        const fq = finalQueueByRoundId.get(r.roundId);
        if (!fq) {
          return {
            roundId: r.roundId,
            label: r.label,
            status: "NOT_STARTED",
            content: <p className="m-0 text-sm text-admin-muted">Этот этап ещё не начался.</p>,
          };
        }
        const allHeatsConfirmed = fq.heats ? fq.heats.length > 0 && fq.heats.every((h) => h.confirmed) : null;
        const doneByMe = r.status === "COMPLETED" || fq.items.length === 0 || (allHeatsConfirmed ?? fq.confirmed);
        return {
          roundId: r.roundId,
          label: r.label,
          status: doneByMe ? "DONE" : "CURRENT",
          content:
            fq.items.length === 0 ? (
              <p className="m-0 text-sm text-admin-muted">Пока нет вызванных участников вашей роли для оценки.</p>
            ) : (
              <FinalJudgingScreen roundId={r.roundId} format={fq.format} criteria={fq.criteria} items={fq.items} confirmed={fq.confirmed} heats={fq.heats} />
            ),
        };
      }

      const roundItems = byRound.get(r.roundId) ?? [];
      const notices = skippedByRound.get(r.roundId) ?? [];
      const confirmed = confirmedSet.has(r.roundId);
      const doneByMe = r.status === "COMPLETED" || (roundItems.length === 0 && notices.length === 0) || confirmed;
      return {
        roundId: r.roundId,
        label: r.label,
        status: doneByMe ? "DONE" : "CURRENT",
        content: (
          <div className="flex flex-col gap-2">
            {notices.map((n) => (
              <p key={`${n.roundId}:${n.role}`} className="m-0 rounded-app border border-admin-border bg-admin-card p-3 text-sm text-admin-muted">
                {ROLE_LABELS[n.role] ?? n.role} не оценивается в этом раунде — участников не больше, чем мест, все проходят автоматически.
              </p>
            ))}
            {roundItems.length > 0 && renderRegularRoundContent(r.roundId, roundItems, confirmed)}
            {roundItems.length === 0 && notices.length === 0 && (
              <p className="m-0 text-sm text-admin-muted">Пока нет вызванных участников вашей роли для оценки.</p>
            )}
          </div>
        ),
      };
    });
    return { divisionId: d.divisionId, categoryName: d.categoryName, stages };
  });

  return (
    <div className="flex flex-col gap-4">
      <JudgeQueueRefresher />
      <div className="flex items-center justify-between gap-2">
        <h1 className="m-0 font-night text-xl font-extrabold text-night-text">Судейство</h1>
        <a href={`/compete/${competitionId}`} className="text-sm text-admin-muted no-underline hover:text-night-text">
          ← К соревнованию
        </a>
      </div>
      <JudgingQueueBanner />
      {categories.length === 0 ? (
        <p className="text-sm text-admin-muted">Вы не назначены судьёй ни на одну категорию этого соревнования.</p>
      ) : (
        <JudgeCategoryTabs categories={categories} />
      )}
    </div>
  );
}
