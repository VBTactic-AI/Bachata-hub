"use client";

// Клиентская часть диагностики (задача §5-6, §10, §14). Отдельный модуль от
// server.ts/collector.ts специально — они используют node:async_hooks и
// node:crypto, которых нет в браузере. Клиент только измеряет и отправляет
// компактную запись на /api/_debug/perf; сама запись и агрегация происходят
// на сервере (collector.ts), единое хранилище для обеих сторон.
import { PERF_DEBUG_CLIENT } from "./flag";

const SERVER_TIMING_RE = /app;dur=([\d.]+)/;

function pathOnly(input: RequestInfo | URL): string {
  try {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    return new URL(url, typeof window !== "undefined" ? window.location.href : "http://localhost").pathname;
  } catch {
    return "?";
  }
}

function reportToServer(payload: Record<string, unknown>) {
  try {
    // fire-and-forget, никогда не должен влиять на UX диагностируемого клика.
    void fetch("/api/perf-debug", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // window/fetch недоступны (SSR-путь по ошибке импортировал модуль) — тихо игнорируем.
  }
}

function logClientBlock(action: string, totalMs: number, networkMs: number | null, serverMs: number | null, frontendMs: number | null, ok: boolean) {
  const status = !ok ? "CRITICAL" : totalMs < 500 ? "GOOD" : totalMs < 1000 ? "WARNING" : "CRITICAL";
  const parts = [`ACTION: ${action}`];
  if (frontendMs != null) parts.push(`frontend ${frontendMs.toFixed(0)}ms`);
  if (networkMs != null) parts.push(`network ${networkMs.toFixed(0)}ms`);
  if (serverMs != null) parts.push(`server ${serverMs.toFixed(0)}ms`);
  parts.push(`total ${totalMs.toFixed(0)}ms`);
  parts.push(`[${status}]`);
  // eslint-disable-next-line no-console
  console.log("[perf]", parts.join(" · "));
}

// Замена обычного fetch() для клика по критической кнопке — одна строка
// вместо fetch(...) в существующем коде, поведение запроса не меняется.
// clickStartedAt (performance.now() в обработчике клика, ДО setLoading/fetch)
// — опционально, даёт долю "frontend" (клик → начало сетевого запроса).
export async function perfFetch(action: string, input: RequestInfo | URL, init?: RequestInit, clickStartedAt?: number): Promise<Response> {
  if (!PERF_DEBUG_CLIENT) return fetch(input, init);

  const fetchStart = performance.now();
  const frontendMs = clickStartedAt != null ? fetchStart - clickStartedAt : null;
  const method = (init?.method ?? "GET").toUpperCase();
  const dedupeKey = `${method} ${pathOnly(input)}`;

  let res: Response;
  try {
    res = await fetch(input, init);
  } catch (err) {
    const totalMs = performance.now() - fetchStart;
    reportToServer({ action, totalMs, frontendMs, networkMs: totalMs, serverMs: null, success: false, dedupeKey, requestCount: 1 });
    logClientBlock(action, totalMs, totalMs, null, frontendMs, false);
    throw err;
  }

  const totalMs = performance.now() - fetchStart;
  const serverTimingRaw = res.headers.get("server-timing");
  const serverMs = serverTimingRaw ? Number(SERVER_TIMING_RE.exec(serverTimingRaw)?.[1] ?? NaN) : null;
  const networkMs = serverMs != null && !Number.isNaN(serverMs) ? Math.max(0, totalMs - serverMs) : null;
  const success = res.ok;

  reportToServer({
    action,
    totalMs,
    frontendMs,
    networkMs,
    serverMs: Number.isNaN(serverMs) ? null : serverMs,
    success,
    dedupeKey,
    requestCount: 1,
  });
  logClientBlock(action, totalMs, networkMs, Number.isNaN(serverMs as number) ? null : serverMs, frontendMs, success);

  return res;
}
