"use client";

// Офлайн-очередь оценок судьи финала (CLAUDE.md §17) — тот же приём, что и
// judge-score-queue.ts (обычные раунды), только ключ — пара
// (drawParticipantId, criterionId), потому что у финала несколько критериев
// на одного участника, а не одна оценка.

const QUEUE_KEY = "bachata:final-judge-score-queue:v1";

type QueuedFinalScore = {
  clientSubmissionId: string;
  drawParticipantId: string;
  criterionId: string;
  value: number;
  queuedAt: number;
};

type QueueState = {
  queue: QueuedFinalScore[];
  errors: Record<string, string>; // "drawParticipantId:criterionId" -> сообщение об ошибке (не сетевой)
};

type Listener = (state: QueueState) => void;

const key = (drawParticipantId: string, criterionId: string) => `${drawParticipantId}:${criterionId}`;

let queue: QueuedFinalScore[] | null = null;
const errors: Record<string, string> = {};
const listeners = new Set<Listener>();
let flushing = false;

function loadQueue(): QueuedFinalScore[] {
  if (queue) return queue;
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY);
    queue = raw ? (JSON.parse(raw) as QueuedFinalScore[]) : [];
  } catch {
    queue = [];
  }
  return queue;
}

function notify() {
  const state: QueueState = { queue: loadQueue(), errors: { ...errors } };
  for (const l of listeners) l(state);
}

function saveQueue(next: QueuedFinalScore[]) {
  queue = next;
  try {
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(next));
  } catch {
    // localStorage недоступен — очередь остаётся только в памяти вкладки.
  }
  notify();
}

export function subscribeFinalJudgeScoreQueue(listener: Listener): () => void {
  listeners.add(listener);
  listener({ queue: loadQueue(), errors: { ...errors } });
  return () => listeners.delete(listener);
}

export function getQueuedFinalScore(drawParticipantId: string, criterionId: string): QueuedFinalScore | undefined {
  return loadQueue().find((q) => q.drawParticipantId === drawParticipantId && q.criterionId === criterionId);
}

export function enqueueFinalJudgeScore(drawParticipantId: string, criterionId: string, value: number) {
  const k = key(drawParticipantId, criterionId);
  delete errors[k];
  const next = loadQueue().filter((q) => !(q.drawParticipantId === drawParticipantId && q.criterionId === criterionId));
  next.push({ clientSubmissionId: crypto.randomUUID(), drawParticipantId, criterionId, value, queuedAt: Date.now() });
  saveQueue(next);
  void flushFinalJudgeScoreQueue();
}

type SendResult = { status: "ok" } | { status: "retry" } | { status: "error"; message: string };

async function sendOne(item: QueuedFinalScore): Promise<SendResult> {
  let res: Response;
  try {
    res = await fetch(`/api/draw-participants/${item.drawParticipantId}/final-score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ criterionId: item.criterionId, value: item.value, clientSubmissionId: item.clientSubmissionId }),
    });
  } catch {
    return { status: "retry" };
  }
  if (res.ok) return { status: "ok" };
  if (res.status >= 500) return { status: "retry" };
  const data = await res.json().catch(() => ({}) as { error?: string });
  return { status: "error", message: data.error ?? "Не удалось сохранить оценку." };
}

export async function flushFinalJudgeScoreQueue(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    for (;;) {
      const item = loadQueue()[0];
      if (!item) break;
      const result = await sendOne(item);
      if (result.status === "retry") break;
      const k = key(item.drawParticipantId, item.criterionId);
      if (result.status === "error") {
        errors[k] = result.message;
      } else {
        delete errors[k];
      }
      saveQueue(loadQueue().filter((q) => q.clientSubmissionId !== item.clientSubmissionId));
    }
  } finally {
    flushing = false;
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => void flushFinalJudgeScoreQueue());
  window.addEventListener("focus", () => void flushFinalJudgeScoreQueue());
  setInterval(() => void flushFinalJudgeScoreQueue(), 15000);
  void flushFinalJudgeScoreQueue();
}
