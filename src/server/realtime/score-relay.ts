import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";

// Серверный (никогда не в браузере) синглтон-слушатель Supabase Realtime —
// единственная задача: раздать уже ЗАПИСАННУЮ (через submitJudgeScore/
// submitFinalJudgeScore -> Prisma-транзакцию -> audit) оценку подписчикам
// live-таблицы head judge/admin (score-monitor.ts, SSE-роут). Сам путь
// записи оценки не меняется и здесь не участвует — Realtime только
// транспорт "БД -> сервер" (WAL), не способ записи (CLAUDE.md §8/§9: вся
// бизнес-логика/RBAC/идемпотентность/audit остаются на сервере).
//
// Процесс здесь долгоживущий (Docker/`node server.js`, не serverless —
// см. Dockerfile/docker-compose.yml), поэтому один WS-коннект на весь
// процесс безопасен: держим его лениво, только когда есть хоть один
// подписчик, и полагаемся на встроенный реконнект supabase-js при обрыве.

export type ScoreRelayEvent =
  | { kind: "judge_score"; roundId: string; drawParticipantId: string; judgeAssignmentId: string; value: number }
  | {
      kind: "final_judge_score";
      roundId: string;
      drawParticipantId: string;
      judgeAssignmentId: string;
      criterionId: string;
      value: number;
    };

type Listener = (event: ScoreRelayEvent) => void;

const listenersByRound = new Map<string, Set<Listener>>();
let client: SupabaseClient | null = null;
let channel: RealtimeChannel | null = null;

function emit(roundId: string, event: ScoreRelayEvent): void {
  for (const listener of listenersByRound.get(roundId) ?? []) listener(event);
}

// drawParticipantId -> roundId не меняется после создания (Draw/Heat одного
// участника фиксированы) — простой индексированный запрос на событие,
// кэшировать незачем: события редки (судья тапает вручную), лишний round-trip
// к БД дешевле, чем неограниченно растущий кэш процесса.
async function resolveRoundId(drawParticipantId: string): Promise<string | null> {
  const dp = await prisma.drawParticipant.findUnique({
    where: { id: drawParticipantId },
    select: { draw: { select: { heat: { select: { roundId: true } } } } },
  });
  return dp?.draw.heat.roundId ?? null;
}

type RawRow = Record<string, unknown>;

async function handleJudgeScoreChange(row: RawRow | null | undefined): Promise<void> {
  const drawParticipantId = row?.drawParticipantId;
  const judgeAssignmentId = row?.judgeAssignmentId;
  const value = row?.value;
  if (typeof drawParticipantId !== "string" || typeof judgeAssignmentId !== "string" || typeof value !== "number") return;
  const roundId = await resolveRoundId(drawParticipantId);
  if (!roundId || !listenersByRound.has(roundId)) return; // никто не смотрит этот раунд — резолвить дальше незачем
  emit(roundId, { kind: "judge_score", roundId, drawParticipantId, judgeAssignmentId, value });
}

async function handleFinalJudgeScoreChange(row: RawRow | null | undefined): Promise<void> {
  const drawParticipantId = row?.drawParticipantId;
  const judgeAssignmentId = row?.judgeAssignmentId;
  const criterionId = row?.criterionId;
  const value = row?.value;
  if (
    typeof drawParticipantId !== "string" ||
    typeof judgeAssignmentId !== "string" ||
    typeof criterionId !== "string" ||
    typeof value !== "number"
  ) {
    return;
  }
  const roundId = await resolveRoundId(drawParticipantId);
  if (!roundId || !listenersByRound.has(roundId)) return;
  emit(roundId, { kind: "final_judge_score", roundId, drawParticipantId, judgeAssignmentId, criterionId, value });
}

function ensureChannel(): void {
  if (channel) return;
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    console.error(
      "[score-relay] SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY не заданы — live-обновления таблицы оценок недоступны (страница по-прежнему покажет исходный снимок при загрузке)."
    );
    return;
  }
  client = createClient(url, serviceRoleKey, { realtime: { params: { eventsPerSecond: 10 } } });
  channel = client
    .channel("score-relay")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "JudgeScore" }, (payload) => {
      void handleJudgeScoreChange(payload.new as RawRow);
    })
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "JudgeScore" }, (payload) => {
      void handleJudgeScoreChange(payload.new as RawRow);
    })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "FinalJudgeScore" }, (payload) => {
      void handleFinalJudgeScoreChange(payload.new as RawRow);
    })
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "FinalJudgeScore" }, (payload) => {
      void handleFinalJudgeScoreChange(payload.new as RawRow);
    })
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.error(`[score-relay] Supabase Realtime: ${status} — supabase-js попробует переподключиться сам.`);
      }
    });
}

// Подписка живой SSE-раздачи (score-monitor stream route) на события ОДНОГО
// раунда. Открывает WS-канал лениво при первом подписчике; канал остаётся
// открытым, пока жив хотя бы один подписчик хоть одного раунда (закрывать
// его между просмотрами не даёт выигрыша — соединение лёгкое, а
// пересоздание на каждый чих усложнило бы код без реальной пользы).
export function subscribeToRoundScoreEvents(roundId: string, listener: Listener): () => void {
  ensureChannel();
  const set = listenersByRound.get(roundId) ?? new Set<Listener>();
  set.add(listener);
  listenersByRound.set(roundId, set);
  return () => {
    set.delete(listener);
    if (set.size === 0) listenersByRound.delete(roundId);
  };
}
