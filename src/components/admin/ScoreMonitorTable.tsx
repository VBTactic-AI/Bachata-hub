"use client";

import { useEffect, useRef, useState } from "react";
import type {
  FinalScoreMonitorTable as FinalTable,
  PrelimScoreMonitorTable as PrelimTable,
  ScoreMonitorJudgeColumn,
  ScoreMonitorSnapshot,
} from "@/server/judging/score-monitor";

// Live-таблица оценок для head judge/admin (промт пользователя, 2026-09-07):
// строки — номер участника без имени, столбцы — судьи (имя без email),
// в ячейках — их оценки в прямом эфире; последняя строка — ИТОГО (сдал ли
// судья все оценки, как на его собственном экране). Обновляется по SSE
// (score-relay.ts -> /api/admin/rounds/[roundId]/score-monitor/stream),
// первичный снимок приходит с сервера как props — страница сама решает,
// какой из двух форматов (обычный раунд/финал) запрашивать.

type ScoreEvent =
  | { kind: "judge_score"; roundId: string; drawParticipantId: string; judgeAssignmentId: string; value: number }
  | {
      kind: "final_judge_score";
      roundId: string;
      drawParticipantId: string;
      judgeAssignmentId: string;
      criterionId: string;
      value: number;
    };

// Сервер сам планово закрывает поток раньше таймаута платформы (Vercel,
// maxDuration в stream/route.ts) — браузер (EventSource) переподключается
// к нему сам, обычно за доли секунды. Мигать "переподключение…" на каждый
// такой плановый разрыв было бы шумно и пугало бы зря (2026-09-07) — бейдж
// показывает "не в сети" только если разрыв длится дольше DISCONNECT_DELAY_MS
// подряд; более короткие/штатные переподключения проходят молча.
const DISCONNECT_DELAY_MS = 10000;

// onOpen вызывается при КАЖДОМ (пере)открытии потока — не только при первом
// монтировании. У SSE нет истории "додай то, что пропустил" — единственный
// надёжный способ не зависнуть с устаревшей таблицей молча — полный пересинк
// на каждый (ре)коннект, а не только точечные события между ними (2026-09-07).
function useScoreEvents(roundId: string, onEvent: (event: ScoreEvent) => void, onOpen: () => void): boolean {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;
  // Оптимистично true — не мигаем "переподключение…" сразу же на самое
  // первое (обычно мгновенное) подключение при открытии страницы.
  const [connected, setConnected] = useState(true);

  useEffect(() => {
    const source = new EventSource(`/api/admin/rounds/${roundId}/score-monitor/stream`);
    let disconnectTimer: ReturnType<typeof setTimeout> | null = null;

    source.addEventListener("score", (e) => {
      try {
        onEventRef.current(JSON.parse((e as MessageEvent).data) as ScoreEvent);
      } catch {
        // сообщение непонятного формата — игнорируем, не ломаем поток ради одного события
      }
    });
    source.onopen = () => {
      if (disconnectTimer) {
        clearTimeout(disconnectTimer);
        disconnectTimer = null;
      }
      setConnected(true);
      onOpenRef.current();
    };
    source.onerror = () => {
      // Уже отсчитываем задержку с предыдущей ошибки (браузер сам повторяет
      // попытки, onerror сработает на каждую неудачную) — не перезапускаем
      // таймер заново на каждый повтор, иначе "не в сети" никогда бы не
      // показалось при по-настоящему долгом обрыве.
      if (disconnectTimer) return;
      disconnectTimer = setTimeout(() => {
        setConnected(false);
        disconnectTimer = null;
      }, DISCONNECT_DELAY_MS);
    };
    return () => {
      source.close();
      if (disconnectTimer) clearTimeout(disconnectTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundId]);

  return connected;
}

async function fetchScoreMonitorSnapshot(roundId: string): Promise<ScoreMonitorSnapshot | null> {
  try {
    const res = await fetch(`/api/admin/rounds/${roundId}/score-monitor`);
    if (!res.ok) return null;
    return (await res.json()) as ScoreMonitorSnapshot;
  } catch {
    // сеть недоступна прямо сейчас — следующий (пере)коннект SSE попробует снова
    return null;
  }
}

function JudgeHeaderLabel({ judge }: { judge: ScoreMonitorJudgeColumn }) {
  return (
    <span title={judge.isEmailFallback ? "У судьи нет профиля с именем — показана часть email" : undefined}>
      {judge.displayName}
      {judge.isEmailFallback && <span className="text-muted"> *</span>}
    </span>
  );
}

function LiveBadge({ connected }: { connected: boolean }) {
  return (
    <span className={`hint-text ${connected ? "" : "error-text"}`}>
      {connected ? "● live" : "○ переподключение…"}
    </span>
  );
}

export function PrelimScoreMonitor({
  roundId,
  maxValue,
  initialLeader,
  initialFollower,
}: {
  roundId: string;
  maxValue: number;
  initialLeader: PrelimTable;
  initialFollower: PrelimTable;
}) {
  const [leader, setLeader] = useState(initialLeader);
  const [follower, setFollower] = useState(initialFollower);

  const applyEvent = (event: ScoreEvent) => {
    if (event.kind !== "judge_score") return;
    const apply = (table: PrelimTable): PrelimTable => {
      const rowIdx = table.rows.findIndex((r) => r.drawParticipantId === event.drawParticipantId);
      if (rowIdx === -1 || !table.judges.some((j) => j.judgeAssignmentId === event.judgeAssignmentId)) return table;
      const rows = table.rows.map((r, i) =>
        i === rowIdx ? { ...r, scores: { ...r.scores, [event.judgeAssignmentId]: event.value } } : r
      );
      return { ...table, rows };
    };
    setLeader(apply);
    setFollower(apply);
  };
  const resync = async () => {
    const snapshot = await fetchScoreMonitorSnapshot(roundId);
    if (snapshot?.kind !== "prelim") return;
    setLeader(snapshot.leader);
    setFollower(snapshot.follower);
  };
  const connected = useScoreEvents(roundId, applyEvent, resync);

  return (
    <div className="stack gap-6">
      <LiveBadge connected={connected} />
      <PrelimRoleTable title="Ведущие (Leader)" table={leader} maxValue={maxValue} />
      <PrelimRoleTable title="Ведомые (Follower)" table={follower} maxValue={maxValue} />
    </div>
  );
}

function PrelimRoleTable({ title, table, maxValue }: { title: string; table: PrelimTable; maxValue: number }) {
  return (
    <div>
      <p className="hint-text m-0">
        {title} · шкала 0–{maxValue}
      </p>
      {table.judges.length === 0 ? (
        <p className="hint-text">Судьи на эту роль не назначены.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full mt-1 text-sm border-collapse">
            <thead>
              <tr>
                <th className="border border-line px-2 py-1 text-left">№</th>
                {table.judges.map((j) => (
                  <th key={j.judgeAssignmentId} className="border border-line px-2 py-1 text-center">
                    <JudgeHeaderLabel judge={j} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.length === 0 && (
                <tr>
                  <td className="border border-line px-2 py-1 hint-text" colSpan={table.judges.length + 1}>
                    Участников пока нет.
                  </td>
                </tr>
              )}
              {table.rows.map((r) => (
                <tr key={r.drawParticipantId}>
                  <td className="border border-line px-2 py-1 font-semibold">№{r.bibNumber ?? "—"}</td>
                  {table.judges.map((j) => (
                    <td key={j.judgeAssignmentId} className="border border-line px-2 py-1 text-center">
                      {r.scores[j.judgeAssignmentId] ?? "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold bg-bg">
                <td className="border border-line px-2 py-1">ИТОГО</td>
                {table.judges.map((j) => {
                  const total = table.totals.find((t) => t.judgeAssignmentId === j.judgeAssignmentId);
                  return (
                    <td
                      key={j.judgeAssignmentId}
                      className={`border border-line px-2 py-1 text-center ${total?.complete ? "text-success" : "text-danger"}`}
                    >
                      {total ? `${total.submitted}/${total.required}` : "—"}
                      {total?.confirmed && (
                        <span className="block text-xs text-success" title='Судья нажал "Готово" — оценки зафиксированы'>
                          ✓ Готово
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

export function FinalScoreMonitor({
  roundId,
  initialLeader,
  initialFollower,
}: {
  roundId: string;
  format: string;
  initialLeader: FinalTable;
  initialFollower: FinalTable;
}) {
  const [leader, setLeader] = useState(initialLeader);
  const [follower, setFollower] = useState(initialFollower);

  const applyEvent = (event: ScoreEvent) => {
    if (event.kind !== "final_judge_score") return;
    const apply = (table: FinalTable): FinalTable => {
      const rowIdx = table.rows.findIndex((r) => r.drawParticipantId === event.drawParticipantId);
      if (rowIdx === -1 || !table.judges.some((j) => j.judgeAssignmentId === event.judgeAssignmentId)) return table;
      const rows = table.rows.map((r, i) => {
        if (i !== rowIdx) return r;
        const judgeScores = { ...(r.scores[event.judgeAssignmentId] ?? {}), [event.criterionId]: event.value };
        return { ...r, scores: { ...r.scores, [event.judgeAssignmentId]: judgeScores } };
      });
      return { ...table, rows };
    };
    setLeader(apply);
    setFollower(apply);
  };
  const resync = async () => {
    const snapshot = await fetchScoreMonitorSnapshot(roundId);
    if (snapshot?.kind !== "final") return;
    setLeader(snapshot.leader);
    setFollower(snapshot.follower);
  };
  const connected = useScoreEvents(roundId, applyEvent, resync);

  return (
    <div className="stack gap-6">
      <LiveBadge connected={connected} />
      <FinalRoleTable title="Ведущие (Leader)" table={leader} />
      <FinalRoleTable title="Ведомые (Follower)" table={follower} />
    </div>
  );
}

function FinalRoleTable({ title, table }: { title: string; table: FinalTable }) {
  const criteriaCount = table.criteria.length || 1;
  return (
    <div>
      <p className="hint-text m-0">{title}</p>
      {table.judges.length === 0 ? (
        <p className="hint-text">Судьи на эту роль не назначены.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full mt-1 text-sm border-collapse">
            <thead>
              <tr>
                <th rowSpan={2} className="border border-line px-2 py-1 align-bottom">
                  №
                </th>
                {table.judges.map((j) => (
                  <th key={j.judgeAssignmentId} colSpan={criteriaCount} className="border border-line px-2 py-1 text-center">
                    <JudgeHeaderLabel judge={j} />
                  </th>
                ))}
              </tr>
              <tr>
                {table.judges.flatMap((j) =>
                  table.criteria.map((c) => (
                    <th key={`${j.judgeAssignmentId}:${c.id}`} className="border border-line px-1 py-0.5 text-center hint-text font-normal">
                      {c.name}
                    </th>
                  ))
                )}
              </tr>
            </thead>
            <tbody>
              {table.rows.length === 0 && (
                <tr>
                  <td className="border border-line px-2 py-1 hint-text" colSpan={1 + table.judges.length * criteriaCount}>
                    Участников пока нет.
                  </td>
                </tr>
              )}
              {table.rows.map((r) => (
                <tr key={r.drawParticipantId}>
                  <td className="border border-line px-2 py-1 font-semibold">№{r.bibNumber ?? "—"}</td>
                  {table.judges.flatMap((j) =>
                    table.criteria.map((c) => (
                      <td key={`${j.judgeAssignmentId}:${c.id}`} className="border border-line px-1 py-0.5 text-center">
                        {r.scores[j.judgeAssignmentId]?.[c.id] ?? "—"}
                      </td>
                    ))
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold bg-bg">
                <td className="border border-line px-2 py-1">ИТОГО</td>
                {table.judges.map((j) => {
                  const total = table.totals.find((t) => t.judgeAssignmentId === j.judgeAssignmentId);
                  return (
                    <td
                      key={j.judgeAssignmentId}
                      colSpan={criteriaCount}
                      className={`border border-line px-2 py-1 text-center ${total?.complete ? "text-success" : "text-danger"}`}
                    >
                      {total ? `${total.submitted}/${total.required}` : "—"}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
