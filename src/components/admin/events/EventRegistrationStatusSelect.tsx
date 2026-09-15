"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { EventRegistrationStatus } from "@prisma/client";
import { Select } from "@/components/ui/field";

const STATUS_LABELS: Record<EventRegistrationStatus, string> = {
  REGISTERED: "Зарегистрирован",
  CONFIRMED: "Подтверждён",
  WAITLIST: "Лист ожидания",
  CANCELLED: "Отменил сам",
  REJECTED: "Отклонён",
  NO_SHOW: "Не пришёл",
};

// 2026-09-15: CANCELLED убран из выбираемых организатором значений — это
// статус, который проставляет только сам участник (см. guard в
// registration-service.ts::updateEventRegistration). Оставлять его в
// выпадающем списке означало бы предлагать организатору действие, которое
// сервер всё равно отклонит.
const ORGANIZER_ASSIGNABLE_STATUSES: EventRegistrationStatus[] = ["REGISTERED", "CONFIRMED", "WAITLIST", "REJECTED", "NO_SHOW"];

const FIELD_CLASS = "max-w-[180px] border-admin-border bg-admin-card2 py-1.5 text-sm text-night-text focus:border-admin-primary focus:ring-admin-primary/20";

// Events Engine, этап 3 — плейн-обновление статуса (без state-machine, тот же
// уровень MVP, что и updateEventRegistration на сервере, см. комментарий там).
export function EventRegistrationStatusSelect({
  eventSlug,
  registrationId,
  status,
}: {
  eventSlug: string;
  registrationId: string;
  status: EventRegistrationStatus;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onChange(next: EventRegistrationStatus) {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/events/${eventSlug}/registrations/${registrationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.message || data.error || "Не удалось изменить статус.");
      return;
    }
    router.refresh();
  }

  // Участник отменил сам — организатор больше не может это изменить (сервер
  // отклонит любую попытку, см. registration-service.ts), поэтому вместо
  // выпадающего списка показываем статичную надпись.
  if (status === "CANCELLED") {
    return <span className="text-sm text-admin-muted">{STATUS_LABELS.CANCELLED}</span>;
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <Select
        value={status}
        disabled={loading}
        onChange={(e) => onChange(e.target.value as EventRegistrationStatus)}
        className={FIELD_CLASS}
      >
        {ORGANIZER_ASSIGNABLE_STATUSES.map((value) => (
          <option key={value} value={value}>
            {STATUS_LABELS[value]}
          </option>
        ))}
      </Select>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </span>
  );
}
