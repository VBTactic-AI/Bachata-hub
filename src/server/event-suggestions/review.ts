import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/auth";
import { logModeration } from "@/lib/moderation";
import { emitDomainEvent } from "@/server/notifications/emit-domain-event";
import { EventSuggestionAlreadyReviewedError, EventSuggestionForbiddenError, EventSuggestionNotFoundError } from "./errors";

export type EventSuggestionReviewAction = "approve" | "reject";

// §7 ТЗ (Event Suggestions) — решение админа. Approve НЕ создаёт Event
// автоматически (осознанно, по образцу минимализма проекта — CLAUDE.md §54):
// это просто подтверждение "мы посмотрим на это", реальное событие админ
// создаёт сам через обычный EventWizard, когда дойдут руки; заявитель
// получает уведомление либо о принятии к рассмотрению, либо об отказе.
export async function reviewEventSuggestion(params: {
  reviewer: User;
  suggestionId: string;
  action: EventSuggestionReviewAction;
  reason?: string;
}) {
  if (!isAdmin(params.reviewer)) throw new EventSuggestionForbiddenError("forbidden");

  const suggestion = await prisma.eventSuggestion.findUnique({ where: { id: params.suggestionId } });
  if (!suggestion) throw new EventSuggestionNotFoundError();
  if (suggestion.status !== "PENDING") throw new EventSuggestionAlreadyReviewedError();

  const status = params.action === "approve" ? "APPROVED" : "REJECTED";
  const domainEventType = status === "APPROVED" ? "EVENT_SUGGESTION_APPROVED" : "EVENT_SUGGESTION_REJECTED";

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.eventSuggestion.update({
      where: { id: suggestion.id },
      data: { status, reviewedById: params.reviewer.id, reviewedAt: new Date(), reviewComment: params.reason },
    });

    await emitDomainEvent(tx, {
      type: domainEventType,
      payload: { entityId: row.id, title: row.title, directUserId: row.suggestedById },
      idempotencyKey: `${domainEventType}:${row.id}`,
    });

    return row;
  });

  // Вне транзакции — тот же порядок, что и в reviewAccessRequest (logModeration
  // использует глобальный prisma, не tx).
  await logModeration(params.reviewer, "EVENT_SUGGESTION", suggestion.id, params.action, params.reason);

  return updated;
}
