"use client";

// Офлайн-очередь оценок судьи (CLAUDE.md §17): судья на телефоне может на
// время потерять связь во время конкурса. Клик по кнопке кладёт оценку в
// очередь (localStorage — переживает перезагрузку страницы/офлайн-режим) и
// сразу пытается её отправить; при неудаче сети запись остаётся в очереди
// и досылается сама при восстановлении связи. Сервер (submitJudgeScore)
// остаётся источником истины — очередь только доставляет запрос до него,
// ничего не решает сама. Общий модуль, а не состояние одной кнопки —
// на странице судьи одновременно рендерится много кнопок оценки.

import { perfFetch } from "@/lib/performance-debug/client";

const QUEUE_KEY = "bachata:judge-score-queue:v1";

type QueuedScore = {
  clientSubmissionId: string;
  drawParticipantId: string;
  value: number;
  queuedAt: number;
};

type QueueState = {
  queue: QueuedScore[];
  errors: Record<string, string>; // drawParticipantId -> сообщение об ошибке (не сетевой)
};

type Listener = (state: QueueState) => void;

let queue: QueuedScore[] | null = null;
const errors: Record<string, string> = {};
const listeners = new Set<Listener>();
let flushing = false;

function loadQueue(): QueuedScore[] {
  if (queue) return queue;
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY);
    queue = raw ? (JSON.parse(raw) as QueuedScore[]) : [];
  } catch {
    queue = [];
  }
  return queue;
}

function notify() {
  const state: QueueState = { queue: loadQueue(), errors: { ...errors } };
  for (const l of listeners) l(state);
}

function saveQueue(next: QueuedScore[]) {
  queue = next;
  try {
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(next));
  } catch {
    // localStorage недоступен (приватный режим и т.п.) — очередь останется
    // только в памяти вкладки, лучше так, чем не работать вовсе.
  }
  notify();
}

export function subscribeJudgeScoreQueue(listener: Listener): () => void {
  listeners.add(listener);
  listener({ queue: loadQueue(), errors: { ...errors } });
  return () => listeners.delete(listener);
}

export function getQueuedScore(drawParticipantId: string): QueuedScore | undefined {
  return loadQueue().find((q) => q.drawParticipantId === drawParticipantId);
}

// Судья ставит/меняет оценку — кладём в очередь, заменяя предыдущую ещё не
// отправленную запись для этого же участника (в силе только последнее
// нажатие), и сразу пробуем отправить.
export function enqueueJudgeScore(drawParticipantId: string, value: number) {
  // UX-003: то же самое значение уже в очереди (ещё не доставлено или
  // прямо сейчас в полёте, sendOne успел прочитать его до этого клика, но
  // ещё не удалил) — повторный тап того же варианта не должен плодить
  // второй сетевой запрос с новым clientSubmissionId и лишнюю запись
  // "score.correct" на сервере (before===after).
  const existing = loadQueue().find((q) => q.drawParticipantId === drawParticipantId);
  if (existing && existing.value === value) return;

  delete errors[drawParticipantId];
  const next = loadQueue().filter((q) => q.drawParticipantId !== drawParticipantId);
  next.push({ clientSubmissionId: crypto.randomUUID(), drawParticipantId, value, queuedAt: Date.now() });
  saveQueue(next);
  void flushJudgeScoreQueue();
}

type SendResult = { status: "ok" } | { status: "retry" } | { status: "error"; message: string };

async function sendOne(item: QueuedScore): Promise<SendResult> {
  let res: Response;
  try {
    res = await perfFetch("judge.submit_score", `/api/draw-participants/${item.drawParticipantId}/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: item.value, clientSubmissionId: item.clientSubmissionId }),
    });
  } catch {
    return { status: "retry" }; // сети нет — оставляем в очереди
  }
  if (res.ok) return { status: "ok" };
  if (res.status >= 500) return { status: "retry" }; // временная проблема сервера — тоже стоит повторить
  const data = await res.json().catch(() => ({}) as { error?: string });
  return { status: "error", message: data.error ?? "Не удалось сохранить оценку." };
}

// Досылает очередь по порядку. Останавливается на первой сетевой неудаче,
// чтобы не отправить более новую оценку раньше старой. Настоящая ошибка
// сервера (не сетевая) убирает конкретную запись из очереди и переходит к
// следующей — повторять заведомо отклонённый запрос бесконечно бессмысленно.
export async function flushJudgeScoreQueue(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    for (;;) {
      const item = loadQueue()[0];
      if (!item) break;
      const result = await sendOne(item);
      if (result.status === "retry") break;
      if (result.status === "error") {
        errors[item.drawParticipantId] = result.message;
      } else {
        delete errors[item.drawParticipantId];
      }
      saveQueue(loadQueue().filter((q) => q.clientSubmissionId !== item.clientSubmissionId));
    }
  } finally {
    flushing = false;
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => void flushJudgeScoreQueue());
  window.addEventListener("focus", () => void flushJudgeScoreQueue());
  // Периодический ретрай — на случай, если браузер не заметил восстановление
  // связи (event "online" не всегда надёжен на мобильных сетях).
  setInterval(() => void flushJudgeScoreQueue(), 15000);
  void flushJudgeScoreQueue();
}
