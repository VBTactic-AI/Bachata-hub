"use client";

import { useEffect, useRef, useState } from "react";
import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import type {
  FinalScoreMonitorTable as FinalTable,
  PrelimScoreMonitorTable as PrelimTable,
  ScoreMonitorJudgeColumn,
  ScoreMonitorSnapshot,
} from "@/server/judging/score-monitor";

// Live-таблица оценок для head judge/admin (промт пользователя, 2026-09-07):
// строки — номер участника без имени, столбцы — судьи (имя без email),
// в ячейках — их оценки в прямом эфире; последняя строка — ИТОГО (сдал ли
// судья все оценки, как на его собственном экране). Браузер подписывается
// на Supabase Realtime НАПРЯМУЮ (без сервера-посредника — тот обрывался и
// холодно стартовал заново каждые ~55-60с на Vercel serverless, 2026-09-07,
// найдено по логам "Waiting for server response" ~20-30с). Сервер выдаёт
// только короткоживущий токен на конкретный раунд (realtime-token/route.ts,
// после обычной requirePermission) — RLS-политика "realtime_read_by_round_token"
// (миграция 20260907020000) не даёт увидеть чужие раунды. Первичный снимок
// приходит с сервера как props (обычный SSR).

type ScoreEvent =
  | { kind: "judge_score"; drawParticipantId: string; judgeAssignmentId: string; value: number }
  | { kind: "final_judge_score"; drawParticipantId: string; judgeAssignmentId: string; criterionId: string; value: number }
  // RELATIVE_PLACEMENT (скейтинг) — атомарная подмена места (final-scoring.ts)
  // УДАЛЯЕТ запись прежнего обладателя места, а не просто меняет её значение.
  // Без отдельного события на DELETE монитор никогда не узнавал об этом и
  // молча продолжал показывать старое значение освобождённого участника —
  // выглядело как "два участника с одинаковым местом у одного судьи", хотя
  // в БД дубликата не было (найдено вживую, 2026-09-07).
  | { kind: "final_judge_score_deleted"; drawParticipantId: string; judgeAssignmentId: string; criterionId: string }
  // Судья нажал "Готово" (confirmJudgeRoundDone/confirmFinalJudgeRoundDone) —
  // отдельно от самих оценок: без этого события подпись "✓ Готово" на
  // мониторе появлялась бы только после следующего пересинка, а не сразу
  // (найдено вживую, 2026-09-07).
  | { kind: "judge_round_confirmation"; judgeAssignmentId: string };

const anonUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function fetchRealtimeToken(roundId: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/admin/rounds/${roundId}/score-monitor/realtime-token`);
    if (!res.ok) return null;
    const data = (await res.json()) as { token: string };
    return data.token;
  } catch {
    return null;
  }
}

// Реальная сессия короче TTL токена (10 минут) — обновляем заранее, чтобы
// подписка не потеряла авторизацию посреди просмотра.
const TOKEN_REFRESH_MS = 8 * 60 * 1000;
// Разрыв WS кратковременный/штатный — не мигаем "переподключение…" сразу,
// только если реально не восстановилось дольше этого времени (2026-09-07).
const DISCONNECT_DELAY_MS = 10000;

// onOpen вызывается при КАЖДОМ (пере)подключении канала — не только при
// первом монтировании: у Realtime-подписки нет истории "додай то, что
// пропустил" во время разрыва, единственный надёжный способ не зависнуть с
// устаревшей таблицей молча — полный пересинк на каждый (ре)коннект.
function useScoreEvents(roundId: string, onEvent: (event: ScoreEvent) => void, onOpen: () => void): boolean {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;
  const [connected, setConnected] = useState(true);

  useEffect(() => {
    if (!anonUrl || !anonKey) {
      console.error("NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY не заданы — live-обновления недоступны.");
      setConnected(false);
      return;
    }
    const supabase = createClient(anonUrl, anonKey);
    let channel: RealtimeChannel | null = null;
    let disconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let refreshTimer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    function scheduleDisconnectBadge() {
      if (disconnectTimer) return;
      disconnectTimer = setTimeout(() => {
        setConnected(false);
        disconnectTimer = null;
      }, DISCONNECT_DELAY_MS);
    }
    function clearDisconnectBadge() {
      if (disconnectTimer) {
        clearTimeout(disconnectTimer);
        disconnectTimer = null;
      }
      setConnected(true);
    }

    async function start() {
      const token = await fetchRealtimeToken(roundId);
      if (cancelled || !token) {
        scheduleDisconnectBadge();
        return;
      }
      // ВАЖНО: await обязателен. Без него channel.subscribe() ниже мог
      // отправить join-сообщение раньше, чем токен реально применится
      // внутри supabase-js (гонка, найденная вживую, 2026-09-07) — RLS
      // тогда молча не пропускала ни одного события, будто токен не действует
      // вовсе, хотя сам токен и политика были верны.
      await supabase.realtime.setAuth(token);
      if (cancelled) return;

      channel = supabase
        .channel(`score-monitor:${roundId}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "JudgeScore" }, (payload) => {
          onEventRef.current({ kind: "judge_score", ...(payload.new as { drawParticipantId: string; judgeAssignmentId: string; value: number }) });
        })
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "JudgeScore" }, (payload) => {
          onEventRef.current({ kind: "judge_score", ...(payload.new as { drawParticipantId: string; judgeAssignmentId: string; value: number }) });
        })
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "FinalJudgeScore" }, (payload) => {
          onEventRef.current({
            kind: "final_judge_score",
            ...(payload.new as { drawParticipantId: string; judgeAssignmentId: string; criterionId: string; value: number }),
          });
        })
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "FinalJudgeScore" }, (payload) => {
          onEventRef.current({
            kind: "final_judge_score",
            ...(payload.new as { drawParticipantId: string; judgeAssignmentId: string; criterionId: string; value: number }),
          });
        })
        // REPLICA IDENTITY FULL на FinalJudgeScore (миграция
        // 20260907030000) гарантирует, что payload.old несёт полную
        // удалённую строку, а не только id — иначе тут нечем было бы понять,
        // чью именно ячейку освобождать.
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "FinalJudgeScore" }, (payload) => {
          const old = payload.old as Partial<{ drawParticipantId: string; judgeAssignmentId: string; criterionId: string }>;
          if (!old.drawParticipantId || !old.judgeAssignmentId || !old.criterionId) return;
          onEventRef.current({
            kind: "final_judge_score_deleted",
            drawParticipantId: old.drawParticipantId,
            judgeAssignmentId: old.judgeAssignmentId,
            criterionId: old.criterionId,
          });
        })
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "JudgeRoundConfirmation" }, (payload) => {
          onEventRef.current({
            kind: "judge_round_confirmation",
            ...(payload.new as { judgeAssignmentId: string }),
          });
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            clearDisconnectBadge();
            onOpenRef.current();
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            scheduleDisconnectBadge();
          }
        });

      // Токен короче сессии специально (round-token.ts) — обновляем, пока
      // канал открыт, иначе подписка молча перестанет видеть новые строки
      // после истечения токена (RLS начнёт отклонять).
      refreshTimer = setInterval(async () => {
        const fresh = await fetchRealtimeToken(roundId);
        if (fresh) await supabase.realtime.setAuth(fresh);
      }, TOKEN_REFRESH_MS);
    }

    void start();

    return () => {
      cancelled = true;
      if (disconnectTimer) clearTimeout(disconnectTimer);
      if (refreshTimer) clearInterval(refreshTimer);
      if (channel) supabase.removeChannel(channel);
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
  finalistsCount,
  initialLeader,
  initialFollower,
}: {
  roundId: string;
  maxValue: number;
  finalistsCount: number;
  initialLeader: PrelimTable;
  initialFollower: PrelimTable;
}) {
  const [leader, setLeader] = useState(initialLeader);
  const [follower, setFollower] = useState(initialFollower);

  // "Да/Нет"/"0/1/2" — required/submitted это "положительная оценка / сколько
  // должно пройти дальше" (та же величина, что судья видит на своём экране),
  // не "сколько участников вообще оценено" — см. score-monitor.ts. required
  // сам по себе не меняется от одной новой оценки (участники/finalistsCount
  // раунда фиксированы, пока он идёт), пересчитываем только submitted/complete
  // — иначе строка ИТОГО замирала бы до следующего полного пересинка
  // (жалоба пользователя на живом табло, 2026-09-07).
  const isConfirmationBased = (maxValue === 1 || maxValue === 2) && finalistsCount > 0;
  const applyEvent = (event: ScoreEvent) => {
    if (event.kind === "judge_round_confirmation") {
      const confirm = (table: PrelimTable): PrelimTable => ({
        ...table,
        totals: table.totals.map((t) => (t.judgeAssignmentId === event.judgeAssignmentId ? { ...t, confirmed: true } : t)),
      });
      setLeader(confirm);
      setFollower(confirm);
      return;
    }
    if (event.kind !== "judge_score") return;
    const apply = (table: PrelimTable): PrelimTable => {
      const rowIdx = table.rows.findIndex((r) => r.drawParticipantId === event.drawParticipantId);
      const judgeAssignmentId = event.judgeAssignmentId;
      if (rowIdx === -1 || !table.judges.some((j) => j.judgeAssignmentId === judgeAssignmentId)) return table;
      const rows = table.rows.map((r, i) =>
        i === rowIdx ? { ...r, scores: { ...r.scores, [judgeAssignmentId]: event.value } } : r
      );
      const totals = table.totals.map((t) => {
        if (t.judgeAssignmentId !== judgeAssignmentId || t.required === 0) return t;
        const submitted = isConfirmationBased
          ? rows.filter((r) => (r.scores[judgeAssignmentId] ?? 0) > 0).length
          : rows.filter((r) => r.scores[judgeAssignmentId] !== null).length;
        const complete = isConfirmationBased ? submitted === t.required : submitted >= t.required;
        return { ...t, submitted, complete };
      });
      return { ...table, rows, totals };
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
    if (event.kind === "judge_round_confirmation") {
      const confirm = (table: FinalTable): FinalTable => ({
        ...table,
        totals: table.totals.map((t) => (t.judgeAssignmentId === event.judgeAssignmentId ? { ...t, confirmed: true } : t)),
      });
      setLeader(confirm);
      setFollower(confirm);
      return;
    }
    if (event.kind !== "final_judge_score" && event.kind !== "final_judge_score_deleted") return;
    const judgeAssignmentId = event.judgeAssignmentId;
    // "final_judge_score_deleted" (атомарная подмена места, RELATIVE_PLACEMENT)
    // пишет в ячейку null тем же путём, каким INSERT/UPDATE пишет туда
    // значение — освобождённый участник должен показать "—", а не застрять
    // со старым значением до следующего полного пересинка.
    const newValue = event.kind === "final_judge_score" ? event.value : null;
    const apply = (table: FinalTable): FinalTable => {
      const rowIdx = table.rows.findIndex((r) => r.drawParticipantId === event.drawParticipantId);
      if (rowIdx === -1 || !table.judges.some((j) => j.judgeAssignmentId === judgeAssignmentId)) return table;
      const rows = table.rows.map((r, i) => {
        if (i !== rowIdx) return r;
        const judgeScores = { ...(r.scores[judgeAssignmentId] ?? {}), [event.criterionId]: newValue };
        return { ...r, scores: { ...r.scores, [judgeAssignmentId]: judgeScores } };
      });
      // required фиксирован (участники × применимые критерии для этого
      // судьи не меняются от одной новой оценки) — пересчитываем только
      // submitted: ячейки, неприменимые этому судье, так и останутся null
      // (в них никогда не прилетает событие), поэтому подсчёт непустых
      // ячеек корректен без отдельного знания, какие критерии применимы.
      const totals = table.totals.map((t) => {
        if (t.judgeAssignmentId !== judgeAssignmentId) return t;
        const submitted = rows.reduce((sum, r) => sum + Object.values(r.scores[judgeAssignmentId] ?? {}).filter((v) => v !== null).length, 0);
        return { ...t, submitted, complete: submitted >= t.required };
      });
      return { ...table, rows, totals };
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
