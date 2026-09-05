// Единственная точка правды "включена ли диагностика производительности".
// ВРЕМЕННЫЙ модуль (см. docs/PROGRESS.md, задача "Performance Diagnostic
// Mode") — при выключенном флаге ничего не измеряется, ничего не пишется в
// консоль, поведение приложения не отличается от обычного.
//
// Два флага, а не один:
// - PERFORMANCE_DEBUG — серверная часть (Prisma query log, замер операций).
//   Задаётся в .env/.env.local, недоступен в браузере.
// - NEXT_PUBLIC_PERFORMANCE_DEBUG — включает клиентскую часть (обёртку над
//   fetch и debug-панель). Next.js инлайнит NEXT_PUBLIC_* переменные в
//   клиентский бандл на этапе сборки, поэтому она объявлена отдельно от
//   серверной, а не читается из process.env.PERFORMANCE_DEBUG на клиенте.
export const PERF_DEBUG_SERVER = process.env.PERFORMANCE_DEBUG === "true";
export const PERF_DEBUG_CLIENT = process.env.NEXT_PUBLIC_PERFORMANCE_DEBUG === "true";
