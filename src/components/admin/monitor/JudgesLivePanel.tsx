"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
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

function totalsOf(snapshot: Awaited<ReturnType<typeof fetchScoreMonitorSnapshot>>): ScoreMonitorTotal[] {
  if (!snapshot || snapshot.kind === "none") return [];
  return [...snapshot.leader.totals, ...snapshot.follower.totals];
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
}: {
  roundId: string;
  roundStatus: RoundStatus;
  leaders: MonitorJudge[];
  followers: MonitorJudge[];
  canViewLive: boolean;
  scoreMonitorHref: string | null;
}) {
  const live = canViewLive && LIVE_ROUND_STATUSES.has(roundStatus);
  const [totals, setTotals] = useState<Map<string, ScoreMonitorTotal>>(new Map());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resync = useCallback(async () => {
    const snapshot = await fetchScoreMonitorSnapshot(roundId);
    if (!snapshot) return;
    setTotals(new Map(totalsOf(snapshot).map((t) => [t.judgeAssignmentId, t])));
  }, [roundId]);

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
      {/* Ссылка — сверху, перед карточкой "Судьи категории" (по прямому
          запросу пользователя, 2026-09-09), своя отдельная плашка. Залита
          акцентным градиентом, а не приглушённым текстом — раньше терялась
          рядом с остальными приглушёнными подписями (по прямому замечанию
          пользователя, 2026-09-09). */}
      {scoreMonitorHref && (
        <Link
          href={scoreMonitorHref}
          className="flex items-center justify-center gap-2 rounded-app bg-gradient-admin-cta px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:brightness-[1.06]"
        >
          Монитор оценок судей<span aria-hidden="true">→</span>
        </Link>
      )}

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
