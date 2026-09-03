import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ConcurrentModificationError, InvalidStateTransitionError } from "../errors";
import { writeAudit } from "../audit/audit";
import type { Actor } from "../rbac/actor";

export type TransitionTable<S extends string> = Partial<Record<S, readonly S[]>>;

type PrismaTx = Prisma.TransactionClient;

export type TransitionParams<S extends string> = {
  entityType: string;
  entityId: string;
  table: TransitionTable<S>;
  currentStatus: S;
  statusVersion: number;
  to: S;
  actor: Actor;
  reason?: string;
  // Точка расширения под бизнес-валидацию сверх самой таблицы переходов
  // (напр. "все обязательные оценки получены" перед публикацией раунда,
  // 03 §3 "business rule validation"). На фундаменте почти всегда пусто —
  // сами эти правила появятся вместе с draw/scoring/advancement сервисами.
  guard?: (tx: PrismaTx) => Promise<void> | void;
  // Пишет новый статус внутри транзакции. WHERE обязан включать проверку
  // statusVersion (updateMany + count === 1) — это и есть оптимистичная
  // блокировка (03 §27): "Two admins cannot both successfully start the
  // same heat". Возвращает before/after для audit log и число обновлённых
  // строк — 0 означает, что кто-то опередил нас между чтением и записью.
  applyUpdate: (
    tx: PrismaTx,
    args: { to: S; expectedVersion: number }
  ) => Promise<{
    before: Record<string, unknown>;
    after: Record<string, unknown>;
    updatedCount: number;
  }>;
};

// Единая точка выполнения переходов состояний (CLAUDE.md §9/§10): проверяет
// допустимость перехода, выполняет его в транзакции с оптимистичной
// блокировкой, пишет AuditLog. Недопустимый переход отклоняется ДО записи
// в БД — состояние в базе не меняется, аудит не пополняется.
export async function transition<S extends string>(params: TransitionParams<S>): Promise<void> {
  const { entityType, entityId, table, currentStatus, statusVersion, to, actor, reason, guard, applyUpdate } =
    params;

  const allowed = table[currentStatus] ?? [];
  if (!allowed.includes(to)) {
    throw new InvalidStateTransitionError(entityType, currentStatus, to);
  }

  await prisma.$transaction(async (tx) => {
    if (guard) await guard(tx);

    const { before, after, updatedCount } = await applyUpdate(tx, { to, expectedVersion: statusVersion });
    if (updatedCount === 0) {
      // Кто-то другой уже изменил статус между нашим чтением и записью —
      // не наш случай "недопустимый переход", а конкурентная гонка.
      throw new ConcurrentModificationError(entityType);
    }

    await writeAudit(tx, {
      actor,
      action: `${entityType.toLowerCase()}.transition`,
      entityType,
      entityId,
      before,
      after,
      reason,
    });
  });
}
