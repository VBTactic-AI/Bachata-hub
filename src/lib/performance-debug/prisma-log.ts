import type { PrismaClient } from "@prisma/client";
import { recordQuerySample } from "./server-context";

// Измеряет каждый вызов Prisma-клиента (findUnique, upsert, $transaction-шаг
// и т.д.) — НЕ читает и не логирует args/результат (в них реальные имена,
// bib-номера и т.п. — задача §10/§22), только "операция + модель + время".
//
// Почему $extends(), а не $on("query", ...) (как было в первой версии этого
// файла): событие "query" эмитится движком Prisma через границу engine-
// процесса, и обнаружилось вживую (проверка Performance Diagnostic Mode на
// реальном dev-сервере), что к этому моменту AsyncLocalStorage-контекст
// measureServerOperation() уже потерян — store всегда приходил пустым, хотя
// сами SQL-запросы реально выполнялись. $allOperations() из $extends()
// оборачивает вызов ПРЯМО в промис-цепочку кода, который его вызвал — тот же
// continuation, где AsyncLocalStorage работает штатно.
export function attachPerfQueryLogging<T extends PrismaClient>(client: T) {
  return client.$extends({
    name: "perf-debug-query-timing",
    query: {
      $allOperations({ model, operation, args, query }) {
        const start = performance.now();
        return query(args).finally(() => {
          recordQuerySample({ label: `${operation} ${model ?? "$transaction"}`, durationMs: performance.now() - start });
        });
      },
    },
  });
}
