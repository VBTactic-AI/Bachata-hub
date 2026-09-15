import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { EventSuggestionValidationError } from "./errors";
import { suggestEventSchema, type SuggestEventInput } from "./schemas";

// §7 ТЗ (Event Suggestions) — обычный пользователь (canCreateEvents() его не
// пропускает создавать Event сам) предлагает идею события админу. Никакого
// RBAC-гейта на подачу нет намеренно — суть фичи в том, что её могут
// использовать именно НЕ-организаторы; getCurrentUser() (проверяется в API
// роуте) — единственное требование.
export async function suggestEvent(user: User, input: SuggestEventInput) {
  const parsed = suggestEventSchema.safeParse(input);
  if (!parsed.success) {
    throw new EventSuggestionValidationError(parsed.error.issues.map((i) => i.message));
  }

  return prisma.eventSuggestion.create({
    data: {
      suggestedById: user.id,
      title: parsed.data.title,
      description: parsed.data.description,
      cityId: parsed.data.cityId || null,
      proposedDate: parsed.data.proposedDate ? new Date(parsed.data.proposedDate) : null,
      link: parsed.data.link || null,
    },
  });
}
