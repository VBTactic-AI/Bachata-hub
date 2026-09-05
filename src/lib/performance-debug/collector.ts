import { randomUUID } from "crypto";
import type { ActionStats, BottleneckClass, PerfRecord, PerfReport, QuerySample } from "./types";

// Хранилище измерений — ТОЛЬКО в памяти процесса (задача §3: "не создавать
// постоянную таблицу в Supabase только ради диагностики"). Живёт, пока жив
// dev/staging-сервер; перезапуск сервера = чистая история. Кольцевой буфер,
// чтобы не расти бесконечно за долгую тестовую сессию.
//
// globalThis, а не просто module-level массив — тот же приём, что и у
// singleton'а Prisma (src/lib/prisma.ts) и AsyncLocalStorage
// (server-context.ts). Next.js в dev-режиме перекомпилирует route handler'ы
// по требованию отдельными бандлами; без globalThis каждый такой бандл видел
// бы свой собственный пустой массив records — обнаружено вживую во время
// реальной тестовой сессии: часть запросов из логов сервера (включая два
// успешных generate_rounds) не попала в отчёт /api/perf-debug, потому что
// записывалась в уже отброшенный экземпляр модуля.
const MAX_RECORDS = 2000;
const globalForPerfCollector = globalThis as unknown as { __perfDebugRecords?: PerfRecord[] };
const records = globalForPerfCollector.__perfDebugRecords ?? [];
globalForPerfCollector.__perfDebugRecords = records;

// Порог "похоже на повторный клик/дублирующий запрос" — тот же метод+URL
// дважды в пределах короткого окна (задача §13). Не идеально (не отличает
// намеренный быстрый повтор от бага), поэтому это ПОМЕТКА для отчёта, а не
// блокировка чего-либо.
const DUPLICATE_WINDOW_MS = 4000;
// Порог "похоже на N+1" — один и тот же нормализованный запрос повторяется
// подряд внутри одного действия N и более раз (задача §11).
const N_PLUS_ONE_THRESHOLD = 5;

// Диагностические категории отклика (задача §14), не бизнес-статусы.
function classifyUiThreshold(ms: number): "excellent" | "good" | "noticeable" | "problematic" | "critical" {
  if (ms < 100) return "excellent";
  if (ms < 200) return "good";
  if (ms < 500) return "noticeable";
  if (ms < 1000) return "problematic";
  return "critical";
}

function detectNPlusOne(queries: QuerySample[]): string | null {
  const counts = new Map<string, number>();
  for (const q of queries) counts.set(q.label, (counts.get(q.label) ?? 0) + 1);
  for (const [label, count] of counts) {
    if (count >= N_PLUS_ONE_THRESHOLD) return `${label} × ${count}`;
  }
  return null;
}

function classifyBottleneck(input: {
  totalMs: number;
  dbTotalMs: number | null;
  networkMs: number | null;
  serverMs: number | null;
  frontendMs: number | null;
  hasNPlusOne: boolean;
}): BottleneckClass {
  const { totalMs, dbTotalMs, networkMs, serverMs, frontendMs, hasNPlusOne } = input;
  if (totalMs <= 0) return "UNKNOWN";
  if (hasNPlusOne) return "MULTIPLE_REQUESTS";
  // Не делаем неподтверждённых выводов (задача §18) — если данных для доли
  // недостаточно, честно UNKNOWN, а не угадываем.
  if (dbTotalMs != null && dbTotalMs / totalMs > 0.5) return "DATABASE";
  if (networkMs != null && networkMs / totalMs > 0.5) return "NETWORK";
  if (frontendMs != null && frontendMs / totalMs > 0.5) return "FRONTEND";
  if (serverMs != null && serverMs / totalMs > 0.5) return "SERVER";
  return dbTotalMs == null && networkMs == null && serverMs == null && frontendMs == null ? "UNKNOWN" : "SERVER";
}

export function recordEntry(input: {
  action: string;
  source: PerfRecord["source"];
  success: boolean;
  totalMs: number;
  queries?: QuerySample[];
  networkMs?: number | null;
  serverMs?: number | null;
  frontendMs?: number | null;
  requestCount?: number | null;
  dedupeKey?: string | null;
}): PerfRecord {
  const queries = input.queries ?? [];
  const dbTotalMs = queries.length ? queries.reduce((s, q) => s + q.durationMs, 0) : input.source === "server" ? 0 : null;
  const nPlusOne = detectNPlusOne(queries);
  const warnings: string[] = [];
  if (nPlusOne) warnings.push(`POTENTIAL_N_PLUS_ONE: ${nPlusOne}`);

  const now = Date.now();
  if (input.dedupeKey) {
    const recentDuplicate = records
      .slice(-50)
      .some((r) => r.dedupeKey === input.dedupeKey && now - r.timestamp < DUPLICATE_WINDOW_MS);
    if (recentDuplicate) warnings.push("POTENTIAL_DUPLICATE_REQUEST");
  }

  const bottleneck = classifyBottleneck({
    totalMs: input.totalMs,
    dbTotalMs,
    networkMs: input.networkMs ?? null,
    serverMs: input.serverMs ?? null,
    frontendMs: input.frontendMs ?? null,
    hasNPlusOne: Boolean(nPlusOne),
  });

  const record: PerfRecord = {
    id: randomUUID(),
    action: input.action,
    source: input.source,
    timestamp: now,
    success: input.success,
    totalMs: input.totalMs,
    queries,
    dbTotalMs,
    networkMs: input.networkMs ?? null,
    serverMs: input.serverMs ?? null,
    frontendMs: input.frontendMs ?? null,
    requestCount: input.requestCount ?? null,
    bottleneck,
    warnings,
    dedupeKey: input.dedupeKey ?? null,
  };

  records.push(record);
  if (records.length > MAX_RECORDS) records.splice(0, records.length - MAX_RECORDS);
  return record;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

function statusFor(p95: number, failures: number, warnings: string[]): ActionStats["status"] {
  if (failures > 0 || p95 >= 2000) return "CRITICAL";
  if (p95 >= 500 || warnings.length > 0) return "WARNING";
  return "GOOD";
}

export function getReport(): PerfReport {
  const byAction = new Map<string, PerfRecord[]>();
  for (const r of records) {
    const list = byAction.get(r.action) ?? [];
    list.push(r);
    byAction.set(r.action, list);
  }

  const stats: ActionStats[] = [...byAction.entries()].map(([action, list]) => {
    const durations = list.map((r) => r.totalMs).sort((a, b) => a - b);
    const failures = list.filter((r) => !r.success).length;
    const warningSet = new Set<string>();
    for (const r of list) for (const w of r.warnings) warningSet.add(w);
    const p95 = percentile(durations, 95);
    return {
      action,
      count: list.length,
      avgMs: durations.reduce((s, d) => s + d, 0) / durations.length,
      p50Ms: percentile(durations, 50),
      p95Ms: p95,
      p99Ms: percentile(durations, 99),
      minMs: durations[0] ?? 0,
      maxMs: durations[durations.length - 1] ?? 0,
      failures,
      status: statusFor(p95, failures, [...warningSet]),
      warnings: [...warningSet],
    };
  });
  stats.sort((a, b) => b.p95Ms - a.p95Ms);

  const duplicateRequestCount = records.filter((r) => r.warnings.includes("POTENTIAL_DUPLICATE_REQUEST")).length;
  const potentialNPlusOneCount = records.filter((r) => r.warnings.some((w) => w.startsWith("POTENTIAL_N_PLUS_ONE"))).length;

  return {
    enabled: true,
    totalActions: byAction.size,
    totalRequests: records.length,
    duplicateRequestCount,
    potentialNPlusOneCount,
    stats,
    slowest: [...records].sort((a, b) => b.totalMs - a.totalMs).slice(0, 15),
    recent: records.slice(-30).reverse(),
  };
}

export function clearRecords(): void {
  records.length = 0;
}

export { classifyUiThreshold };
