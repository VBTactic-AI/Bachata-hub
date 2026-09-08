"use client";

import { useEffect, useRef, useState } from "react";
import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import type { ScoreMonitorSnapshot } from "@/server/judging/score-monitor";

// Транспорт live-оценок, общий для монитора оценок (ScoreMonitorTable) и
// монитора соревнования (monitor/JudgesLivePanel). Браузер подписывается на
// Supabase Realtime НАПРЯМУЮ (без сервера-посредника — тот обрывался и холодно
// стартовал заново каждые ~55-60с на Vercel serverless, 2026-09-07, найдено по
// логам "Waiting for server response" ~20-30с). Сервер выдаёт только
// короткоживущий токен на конкретный раунд (realtime-token/route.ts, после
// обычной requirePermission) — RLS-политика "realtime_read_by_round_token"
// (миграция 20260907020000) не даёт увидеть чужие раунды.

export type ScoreEvent =
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
//
// enabled=false вообще не открывает канал (и закрывает уже открытый) — нужно
// монитору соревнования: его вкладка остаётся смонтированной в DOM даже когда
// открыта другая (CompetitionWorkspaceTabs держит все вкладки), и без этого
// флага WS с таймером обновления токена жил бы постоянно, независимо от того,
// идёт ли вообще судейство.
export function useScoreEvents(
  roundId: string,
  onEvent: (event: ScoreEvent) => void,
  onOpen: () => void,
  enabled = true
): boolean {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;
  const [connected, setConnected] = useState(true);

  useEffect(() => {
    if (!enabled) return;
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
  }, [roundId, enabled]);

  return connected;
}

export async function fetchScoreMonitorSnapshot(roundId: string): Promise<ScoreMonitorSnapshot | null> {
  try {
    const res = await fetch(`/api/admin/rounds/${roundId}/score-monitor`);
    if (!res.ok) return null;
    return (await res.json()) as ScoreMonitorSnapshot;
  } catch {
    // сеть недоступна прямо сейчас — следующий (пере)коннект попробует снова
    return null;
  }
}
