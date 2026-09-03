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
  await tx.auditLog.create({
    data: {
      actorId: entry.actor?.userId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      before: entry.before === undefined ? undefined : (entry.before as Prisma.InputJsonValue),
      after: entry.after === undefined ? undefined : (entry.after as Prisma.InputJsonValue),
      reason: entry.reason ?? null,
    },
  });
}
