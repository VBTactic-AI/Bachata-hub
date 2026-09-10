"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RoundStatus } from "@prisma/client";
import type { ScoreMonitorTotal } from "@/server/judging/score-monitor";
import { fetchScoreMonitorSnapshot, useScoreEvents } from "../judging/use-score-events";
import type { MonitorJudge } from "./types";

// Судьи текущей категории прямо в мониторе: кто судит партнёров, кто
// партнёрш, и сколько каждый уже сдал. Оценки — единственное на этом экране,
// что меняется не действиями организатора, а судьями с их телефонов, поэтому
// только здесь нужен live: подписка ровно та же, что у монитора оценок
// (use-score-events), канал score-monitor:{roundId}.
//
// Пересчитывать итоги из самих событий здесь намеренно НЕ пытаемся: "сдал"
// для Да/Нет считается по положительным оценкам и по кнопке "Готово", а не по
// числу кликов (score-monitor.ts) — единственный источник этой арифметики
// сервер, и повторять её на клиенте значило бы завести второе определение
// того же правила. Событие только сообщает "что-то изменилось" → просим
// свежий снимок; всплеск из нескольких оценок подряд схлопывается в один
// запрос.
const RESYNC_DEBOUNCE_MS = 600;

// Судейство идёт только в этих состояниях — в остальных канал не открываем
// вовсе (вкладка монитора остаётся в DOM даже когда открыта другая).
const LIVE_ROUND_STATUSES = new Set<RoundStatus>(["RUNNING", "PAUSED", "SCORING"]);

// CODE-003 (жалоба пользователя, 2026-09-10, JUDGES_DANCE): в этом формате
// один и тот же судья теперь законно встречается в totals ОБЕИХ таблиц —
// leader.totals (как "танцующий" на критериях партнёров, стадия 1) и
// follower.totals (как судья "со стороны" на партнёршах, стадия 2, и
// наоборот для судьи другой роли) — это ДВЕ РАЗНЫЕ порции его общей работы
// по этому раунду, не дубликат одной и той же. Раньше judgeAssignmentId
// просто клался ключом в Map — при совпадении id вторая запись (обычно с
// required=0, пока соответствующая стадия ещё не началась) молча
// ЗАТИРАЛА первую с реальным прогрессом. Явно суммируем required/submitted
// по обеим таблицам — единственный корректный способ показать общий
// прогресс судьи по всему финалу, а не по одной его половине.
function totalsOf(snapshot: Awaited<ReturnType<typeof fetchScoreMonitorSnapshot>>): Map<string, ScoreMonitorTotal> {
  const merged = new Map<string, ScoreMonitorTotal>();
  if (!snapshot || snapshot.kind === "none") return merged;
  for (const t of [...snapshot.leader.totals, ...snapshot.follower.totals]) {
    const existing = merged.get(t.judgeAssignmentId);
    if (!existing) {
      merged.set(t.judgeAssignmentId, t);
      continue;
    }
    const required = existing.required + t.required;
    const submitted = existing.submitted + t.submitted;
    merged.set(t.judgeAssignmentId, {
      judgeAssignmentId: t.judgeAssignmentId,
      required,
      submitted,
      complete: submitted >= required,
      // JudgeRoundConfirmation — одна строка на судью на раунд (не на
      // роль участника), поэтому в обеих записях всегда одно и то же
      // значение — просто берём то, что есть.
      confirmed: existing.confirmed ?? t.confirmed,
    });
  }
  return merged;
}

function JudgeRow({ judge, total }: { judge: MonitorJudge; total: ScoreMonitorTotal | null }) {
  const initials = judge.displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  const pct = total && total.required > 0 ? Math.round((total.submitted / total.required) * 100) : 0;

  return (
    <div className="flex items-center gap-2.5 px-4 py-2">
      <span
        aria-hidden="true"
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-admin-border bg-admin-card2 text-[11px] font-extrabold text-admin-muted"
      >
        {initials}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-night-text">{judge.displayName}</span>
      {total && (
        total.confirmed ? (
          <span className="shrink-0 text-xs font-bold text-night-success" title="Судья нажал «Готово» — оценки зафиксированы">
            ✓ Готово
          </span>
        ) : (
          <>
            <span className="h-1 w-11 shrink-0 overflow-hidden rounded-full bg-admin-border" aria-hidden="true">
              <span className="block h-full bg-admin-primaryHover transition-all" style={{ width: `${pct}%` }} />
            </span>
            <span className="shrink-0 text-xs font-bold tabular-nums text-admin-muted">
              {total.submitted} / {total.required}
            </span>
          </>
        )
      )}
    </div>
  );
}

export function JudgesLivePanel({
  roundId,
  roundStatus,
  leaders,
  followers,
  canViewLive,
  scoreMonitorHref,
  roundResultsHref,
}: {
  roundId: string;
  roundStatus: RoundStatus;
  leaders: MonitorJudge[];
  followers: MonitorJudge[];
  canViewLive: boolean;
  scoreMonitorHref: string | null;
  roundResultsHref: string;
}) {
  const live = canViewLive && LIVE_ROUND_STATUSES.has(roundStatus);
  const [totals, setTotals] = useState<Map<string, ScoreMonitorTotal>>(new Map());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();
  // roundStatus в пропе — серверный снимок на момент рендера страницы, не
  // живой. Раньше единственным способом узнать, что раунд сдвинулся дальше
  // (например, последний судья нажал "Готово", и это само завершило раунд —
  // RUNNING/SCORING -> COMPLETED, advancement.ts), была перезагрузка
  // страницы вручную (жалоба пользователя, 2026-09-10). Раз здесь уже открыт
  // живой канал ради "✓ Готово" по каждому судье, переиспользуем его же
  // пересинк: если свежий снимок говорит, что статус раунда стал другим,
  // просим Next.js перерендерить страницу целиком (router.refresh() —
  // настоящий поход на сервер, но только один раз на переход, не на каждую
  // оценку). refreshedRef не даёт запросить это повторно, пока страница не
  // перерендерится с новым пропом.
  const refreshedRef = useRef(false);
  useEffect(() => {
    refreshedRef.current = false;
  }, [roundStatus]);

  const resync = useCallback(async () => {
    const snapshot = await fetchScoreMonitorSnapshot(roundId);
    if (!snapshot) return;
    setTotals(totalsOf(snapshot));
    if (!refreshedRef.current && snapshot.roundStatus !== null && snapshot.roundStatus !== roundStatus) {
      refreshedRef.current = true;
      router.refresh();
    }
  }, [roundId, roundStatus, router]);

  const scheduleResync = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void resync(), RESYNC_DEBOUNCE_MS);
  }, [resync]);

  // Показанные итоги принадлежат конкретному раунду — при переключении
  // этапа старые нельзя оставлять на экране ни на кадр.
  useEffect(() => {
    setTotals(new Map());
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [roundId]);

  const connected = useScoreEvents(roundId, scheduleResync, resync, live);
  const total = leaders.length + followers.length;

  return (
    <div className="flex flex-col gap-2.5">
      {/* Ссылки — сверху, перед карточкой "Судьи категории" (по прямому
          запросу пользователя, 2026-09-09), своя отдельная плашка. Обе —
          залитые градиентом CTA, а не приглушённым текстом или outline (по
          прямому замечанию пользователя, 2026-09-09: outline-вариант терялся
          рядом с ярким "Монитор оценок судей"). Разный акцент — синий у
          live-инструмента судейства, фиолетовый (admin-violet) у
          "Результаты этапов" — тот же цвет, что и у плитки "Результаты" в
          самом Мониторе (CompetitionMonitor.tsx), так у справочного
          протокола свой узнаваемый акцент, а не просто более тусклая копия
          главной кнопки. Ведёт на вкладку "Результаты" (ResultsWorkspace,
          redesign 2026-09-09), сразу на нужную категорию и этап — доступна
          только SUPER_ADMIN/EVENT_ADMIN, тот же гейт, что у самого
          Монитора. */}
      <div className="flex flex-wrap gap-2">
        {scoreMonitorHref && (
          <Link
            href={scoreMonitorHref}
            className="flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-app bg-gradient-admin-cta px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:brightness-[1.06]"
          >
            Монитор оценок судей<span aria-hidden="true">→</span>
          </Link>
        )}
        <Link
          href={roundResultsHref}
          className="flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-app bg-[linear-gradient(100deg,#8b5cf6,#7c3aed)] px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:brightness-[1.06]"
        >
          Результаты этапов<span aria-hidden="true">→</span>
        </Link>
      </div>

      <section className="overflow-hidden rounded-app border border-admin-border bg-admin-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-admin-border px-4 py-3.5">
          <h3 className="m-0 text-sm font-extrabold text-night-text">Судьи категории</h3>
          <span className="rounded-full bg-admin-card2 px-2.5 py-0.5 text-xs font-bold tabular-nums text-admin-muted">{total}</span>
          {live && (
            <span className={`ml-auto text-xs font-semibold ${connected ? "text-night-success" : "text-red-400"}`}>
              {connected ? "● live" : "○ переподключение…"}
            </span>
          )}
        </div>

        {total === 0 ? (
          <p className="m-0 px-4 py-3 text-sm text-admin-muted">Судьи на категорию не назначены.</p>
        ) : (
          <>
            {(
              [
                ["Судят партнёров", leaders],
                ["Судят партнёрш", followers],
              ] as const
            ).map(([title, list]) =>
              list.length === 0 ? null : (
                <div key={title}>
                  <p className="m-0 border-t border-admin-border bg-admin-card2/40 px-4 py-1.5 text-[10.5px] font-bold uppercase tracking-wider text-admin-disabled">
                    {title} · {list.length}
                  </p>
                  {list.map((j) => (
                    <JudgeRow key={j.judgeAssignmentId} judge={j} total={totals.get(j.judgeAssignmentId) ?? null} />
                  ))}
                </div>
              )
            )}
          </>
        )}
      </section>
    </div>
  );
}
