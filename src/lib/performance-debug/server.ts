import { PERF_DEBUG_SERVER } from "./flag";
import { recordEntry } from "./collector";
import { formatDiagnosticBlock } from "./format";
import { createPerfContext, runInPerfContext } from "./server-context";

// Единая обёртка для измерения серверной операции (задача §2 —
// "startMeasurement/measureAsync/measureServerOperation"). Оборачивает
// существующий route handler / серверный вызов страницы ОДНОЙ строкой —
// ничего не меняет в самой операции, включая её результат и исключения.
//
// При выключенном флаге — просто вызывает fn() напрямую, без каких-либо
// накладных расходов (задача §3: "production behavior не должен меняться").
export async function measureServerOperation<T>(action: string, fn: () => Promise<T>): Promise<T> {
  if (!PERF_DEBUG_SERVER) return fn();

  const ctx = createPerfContext(action);
  const start = performance.now();
  let success = true;
  try {
    return await runInPerfContext(ctx, fn);
  } catch (e) {
    success = false;
    throw e;
  } finally {
    const totalMs = performance.now() - start;
    const record = recordEntry({ action, source: "server", success, totalMs, queries: ctx.queries });
    console.log(formatDiagnosticBlock(record));
  }
}

// Для роутов, где клиент должен сам разделить network/server (Server-Timing,
// задача §7): measureServerOperation уже пишет длительность в консоль/отчёт,
// а этот вариант дополнительно отдаёт саму длительность вызывающему коду,
// чтобы route handler мог проставить заголовок Server-Timing на ответе —
// тогда клиентский perfFetch() посчитает network = total − server сам.
export async function measureServerOperationWithDuration<T>(
  action: string,
  fn: () => Promise<T>
): Promise<[T, number]> {
  if (!PERF_DEBUG_SERVER) return [await fn(), 0];

  const ctx = createPerfContext(action);
  const start = performance.now();
  let success = true;
  try {
    const result = await runInPerfContext(ctx, fn);
    return [result, performance.now() - start];
  } catch (e) {
    success = false;
    throw e;
  } finally {
    const totalMs = performance.now() - start;
    const record = recordEntry({ action, source: "server", success, totalMs, queries: ctx.queries });
    console.log(formatDiagnosticBlock(record));
  }
}

export function serverTimingHeader(serverMs: number): Record<string, string> {
  if (!PERF_DEBUG_SERVER) return {};
  return { "Server-Timing": `app;dur=${serverMs.toFixed(1)}` };
}
