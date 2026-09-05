import { AsyncLocalStorage } from "node:async_hooks";
import type { QuerySample } from "./types";

// Привязывает Prisma-запросы, выполненные внутри measureServerOperation(),
// к тому действию, которое их вызвало — без единой правки в
// scoring/draw-engine/advancement и т.д. (см. prisma-log.ts).
export type PerfContext = { action: string; queries: QuerySample[] };

// globalThis, а не просто module-level const — тот же приём, что и у
// singleton'а Prisma в src/lib/prisma.ts. Next.js компилирует route handler
// и src/lib/prisma.ts (где навешивается $extends(), см. prisma-log.ts) в
// РАЗНЫЕ бандлы; без globalThis каждый бандл получил бы свой собственный
// экземпляр AsyncLocalStorage, и запись из Prisma-расширения писала бы в
// контекст, которого route handler никогда не увидит (обнаружено и
// подтверждено вживую при проверке диагностики).
const globalForPerf = globalThis as unknown as { __perfDebugStorage?: AsyncLocalStorage<PerfContext> };
const storage = globalForPerf.__perfDebugStorage ?? new AsyncLocalStorage<PerfContext>();
globalForPerf.__perfDebugStorage = storage;

export function createPerfContext(action: string): PerfContext {
  return { action, queries: [] };
}

// Намеренно НЕ возвращает queries сам (в отличие от более ранней версии) —
// ctx создаётся и читается вызывающим кодом (server.ts) напрямую, обычным
// объектом по ссылке. storage.getStore() валиден только пока мы физически
// внутри этого run(); при неудаче fn() (throw) вызывающему всё равно нужен
// доступ к уже накопленным ctx.queries, а после выхода из run() ALS уже не
// поможет — только прямая ссылка на ctx это гарантирует (обнаружено вживую:
// Prisma-запросы реально измерялись, но queries приходили пустыми, пока
// чтение шло через storage.getStore() после await, а не через ctx).
export function runInPerfContext<T>(ctx: PerfContext, fn: () => Promise<T>): Promise<T> {
  return storage.run(ctx, fn);
}

export function recordQuerySample(sample: QuerySample): void {
  storage.getStore()?.queries.push(sample);
}
