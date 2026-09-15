import { Card } from "@/components/ui/card";
import type { EventSuggestionStatus } from "@prisma/client";

const STATUS_META: Record<EventSuggestionStatus, { emoji: string; label: string; className: string }> = {
  PENDING: { emoji: "🟡", label: "На проверке", className: "text-night-muted" },
  APPROVED: { emoji: "🟢", label: "Принято", className: "text-night-success" },
  REJECTED: { emoji: "🔴", label: "Отклонено", className: "text-red-400" },
};

// §7 ТЗ (Event Suggestions) — история предложений пользователя, по образцу
// AccessRequestStatusList.tsx (/become-organizer) — не скрываем отклонённые.
export function EventSuggestionStatusList({
  suggestions,
}: {
  suggestions: { id: string; title: string; status: EventSuggestionStatus; reviewComment: string | null; createdAt: Date | string }[];
}) {
  if (suggestions.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {suggestions.map((s) => {
        const meta = STATUS_META[s.status];
        return (
          <Card key={s.id} className="border-night-border bg-night-card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong className="text-night-text">{s.title}</strong>
              <span className={`text-sm font-semibold ${meta.className}`}>
                {meta.emoji} {meta.label}
              </span>
            </div>
            {s.reviewComment && s.status === "REJECTED" && <p className="mt-2 text-sm text-night-muted">Причина: {s.reviewComment}</p>}
          </Card>
        );
      })}
    </div>
  );
}
