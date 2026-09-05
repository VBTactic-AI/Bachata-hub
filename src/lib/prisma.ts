import { PrismaClient } from "@prisma/client";
import { PERF_DEBUG_SERVER } from "./performance-debug/flag";
import { attachPerfQueryLogging } from "./performance-debug/prisma-log";

// PERF_DEBUG_SERVER (временный Performance Diagnostic Mode, docs/PROGRESS.md)
// — единственное отличие от обычной конфигурации: оборачиваем клиент через
// $extends(), чтобы measureServerOperation() мог посчитать, сколько времени
// действия ушло в БД. При выключенном флаге эта ветка не выполняется вообще
// — клиент тот же, что и раньше, без единой лишней обёртки.
// $extends() возвращает клиент с тем же набором методов, но формально другим
// (расширенным, глубоко рекурсивным для компилятора) типом — приводим к
// PrismaClient сразу здесь, одной функцией с явной сигнатурой возврата,
// чтобы TypeScript не пытался разворачивать этот тип нигде за её пределами
// (снаружи это уже ловило "Type instantiation is excessively deep") и чтобы
// весь остальной код (сотни мест) продолжал видеть привычный PrismaClient.
// На реальные вызовы (prisma.round.findUnique(...) и т.п.) это не влияет —
// $extends не убирает и не меняет сигнатуры базовых методов, только
// оборачивает их выполнение.
function createPrismaClient(): PrismaClient {
  const base = new PrismaClient({ log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"] });
  return (PERF_DEBUG_SERVER ? attachPerfQueryLogging(base) : base) as PrismaClient;
}

// Стандартный singleton-паттерн Prisma для Next.js (dev hot-reload не плодит
// новые подключения к БД).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
