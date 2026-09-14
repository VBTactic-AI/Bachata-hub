import { Card } from "@/components/ui/card";
import type { AccessRequestStatus, AccessRequestType } from "@prisma/client";

const TYPE_LABELS: Record<AccessRequestType, string> = {
  EVENT_ORGANIZER: "Организатор мероприятий",
  FESTIVAL_ORGANIZER: "Организатор фестиваля",
  SCHOOL_HEAD: "Руководитель школы",
  COMPETITION_ORGANIZER: "Организатор соревнований",
};

const STATUS_META: Record<AccessRequestStatus, { emoji: string; label: string; className: string }> = {
  PENDING: { emoji: "🟡", label: "На проверке", className: "text-night-muted" },
  NEEDS_INFO: { emoji: "🟠", label: "Нужна информация", className: "text-night-pink" },
  APPROVED: { emoji: "🟢", label: "Доступ одобрен", className: "text-night-success" },
  REJECTED: { emoji: "🔴", label: "Заявка пока не одобрена", className: "text-red-400" },
  REVOKED: { emoji: "⚪", label: "Доступ отозван", className: "text-night-disabled" },
};

// Раздел статуса заявок ("Стать организатором") — на /become-organizer и на
// /profile. Показывает КАЖДУЮ заявку пользователя (история важна — не
// скрываем отклонённые/отозванные молча).
export function AccessRequestStatusList({
  requests,
}: {
  requests: { id: string; type: AccessRequestType; status: AccessRequestStatus; reviewComment: string | null; createdAt: Date | string }[];
}) {
  return (
    <div className="flex flex-col gap-2">
      {requests.map((r) => {
        const meta = STATUS_META[r.status];
        return (
          <Card key={r.id} className="border-night-border bg-night-card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong className="text-night-text">{TYPE_LABELS[r.type]}</strong>
              <span className={`text-sm font-semibold ${meta.className}`}>
                {meta.emoji} {meta.label}
              </span>
            </div>
            {r.reviewComment && (r.status === "NEEDS_INFO" || r.status === "REJECTED") && (
              <p className="mt-2 text-sm text-night-muted">Причина: {r.reviewComment}</p>
            )}
          </Card>
        );
      })}
    </div>
  );
}
