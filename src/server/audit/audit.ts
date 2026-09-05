import type { Prisma } from "@prisma/client";
import type { Actor } from "../rbac/actor";

type PrismaTx = Prisma.TransactionClient;

export type AuditEntry = {
  actor: Actor | null; // null — системное действие (напр. автоматический переход по таймеру), не безымянный пользователь
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
};

// Причина обязательна с точки зрения типов для действий из 03 §24 (reroll,
// override, коррекция оценки, DQ, коррекция результата, unpublish) —
// вызывающий код передаёт reason как обязательный параметр в своей сигнатуре,
// а не полагается на то, что кто-то не забудет её указать здесь.
export async function writeAudit(tx: PrismaTx, entry: AuditEntry): Promise<void> {
  await tx.auditLog.create({ data: toAuditRow(entry) });
}

// Вариант writeAudit() для мест, где заранее известно НЕСКОЛЬКО независимых
// записей аудита за одну операцию (напр. авто-генерация сразу нескольких
// Round/Heat) — каждая запись всё равно получает собственные before/after
// (CLAUDE.md §28 не нарушается, батчится только сама вставка). Обнаружено
// вживую в Performance Diagnostic Mode: 5 последовательных writeAudit() в
// generateRounds() — это 5 отдельных round-trip'ов к Supabase pooler
// (~150мс каждый), тогда как здесь ничего не зависит от id предыдущей
// audit-записи, и объединение в один createMany ничего не меняет по смыслу.
// НЕ подходит для мест, где следующий шаг цикла зависит от результата
// предыдущего create() — там батчить нельзя (см. docs/PROGRESS.md, аудит
// циклов с await prisma... внутри).
export async function writeAuditMany(tx: PrismaTx, entries: AuditEntry[]): Promise<void> {
  if (entries.length === 0) return;
  await tx.auditLog.createMany({ data: entries.map(toAuditRow) });
}

function toAuditRow(entry: AuditEntry) {
  return {
    actorId: entry.actor?.userId ?? null,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    before: entry.before === undefined ? undefined : (entry.before as Prisma.InputJsonValue),
    after: entry.after === undefined ? undefined : (entry.after as Prisma.InputJsonValue),
    reason: entry.reason ?? null,
  };
}
