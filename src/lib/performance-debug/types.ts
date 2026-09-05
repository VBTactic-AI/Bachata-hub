// Общие типы диагностического модуля. См. flag.ts про временность модуля.

export type QuerySample = {
  // Короткая метка запроса (модель+операция, напр. "JudgeScore.upsert"),
  // НЕ сам SQL и НЕ параметры — параметры могут содержать имена/бэйджи
  // участников (CLAUDE.md §22, задача §22).
  label: string;
  durationMs: number;
};

export type BottleneckClass =
  | "FRONTEND"
  | "NETWORK"
  | "SERVER"
  | "DATABASE"
  | "MULTIPLE_REQUESTS"
  | "RENDER"
  | "UNKNOWN";

export type PerfRecordSource = "server" | "client";

export type PerfRecord = {
  id: string;
  action: string;
  source: PerfRecordSource;
  timestamp: number;
  success: boolean;
  totalMs: number;
  // Заполняется только для source="server" (собрано через Prisma query log).
  queries: QuerySample[];
  dbTotalMs: number | null;
  // Заполняется только для source="client" (Server-Timing из ответа).
  networkMs: number | null;
  serverMs: number | null;
  frontendMs: number | null;
  requestCount: number | null;
  bottleneck: BottleneckClass;
  warnings: string[];
  // method+url (без query-параметров, без домена) — только для обнаружения
  // повторных/дублирующих запросов (§12-13 задачи), не для отображения.
  dedupeKey: string | null;
};

export type ActionStats = {
  action: string;
  count: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  minMs: number;
  maxMs: number;
  failures: number;
  status: "GOOD" | "WARNING" | "CRITICAL";
  warnings: string[];
};

export type PerfReport = {
  enabled: boolean;
  totalActions: number;
  totalRequests: number;
  duplicateRequestCount: number;
  potentialNPlusOneCount: number;
  stats: ActionStats[];
  slowest: PerfRecord[];
  recent: PerfRecord[];
};
