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
  const base = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    // Дефолты Prisma (maxWait 2с, timeout 5с) рассчитаны на короткие, редкие
    // транзакции — под нагрузкой на transaction-mode пулер Supabase (несколько
    // клиентов конкурируют за небольшой пул соединений, ~150мс сам по себе
    // на round-trip, см. docs/00_DECISIONS.md) многошаговые транзакции этого
    // движка (жеребьёвка нескольких заездов, старт финала, критерии) могут не
    // успеть получить соединение за 2с — Prisma тогда бросает P2028 "Unable
    // to start a transaction in the given time" ещё ДО начала полезной работы
    // (найдено вживую 2026-09-07: startRoundDrawing падал так на реальном
    // Vercel-деплое). Это не бизнес-ошибка и не повод для отдельного
    // ValidationFailedError — админские операции этого движка редкие и не
    // чувствительны к лишним секундам ожидания, а вот падать вместо того,
    // чтобы дождаться свободного соединения, — Reliability важнее
    // Performance (CLAUDE.md §62). Настройка на уровне клиента, а не на
    // каждом отдельном $transaction() — действует на все вызовы сразу, не
    // нужно находить и править каждый из десятков call site.
    transactionOptions: { maxWait: 10000, timeout: 20000 },
  });
  return (PERF_DEBUG_SERVER ? attachPerfQueryLogging(base) : base) as PrismaClient;
}

// Стандартный singleton-паттерн Prisma для Next.js (dev hot-reload не плодит
// новые подключения к БД).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
