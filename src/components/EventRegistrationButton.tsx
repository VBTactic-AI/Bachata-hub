"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { EventRegistrationStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";

const STATUS_LABEL: Record<EventRegistrationStatus, string> = {
  REGISTERED: "Вы зарегистрированы",
  CONFIRMED: "Регистрация подтверждена",
  WAITLIST: "Вы в листе ожидания",
  CANCELLED: "Регистрация отменена",
  REJECTED: "Заявка отклонена организатором",
  NO_SHOW: "Отмечено как «не пришёл»",
};

// Events Engine, этап 4 — своя кнопка, независимая от AttendanceButtons
// (RSVP "иду/был", не трогается) — см. комментарий у EventRegistration в
// schema.prisma. Тот же общий паттерн (client component, POST/DELETE,
// router.refresh()), что и AttendanceButtons/FollowButton на этой же странице.
export function EventRegistrationButton({
  eventSlug,
  initialStatus,
  loggedIn,
}: {
  eventSlug: string;
  initialStatus: EventRegistrationStatus | null;
  loggedIn: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!loggedIn) {
    return (
      <p className="m-0 text-sm text-night-muted">
        <a href="/login" className="text-night-primary">
          Войдите
        </a>
        , чтобы зарегистрироваться на событие.
      </p>
    );
  }

  const isActive = status === "REGISTERED" || status === "CONFIRMED" || status === "WAITLIST";
  const isDecidedByOrganizer = status === "REJECTED" || status === "NO_SHOW";

  async function register() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/events/${eventSlug}/registrations`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.message || data.error || "Не удалось зарегистрироваться.");
      return;
    }
    setStatus(data.registration.status);
    router.refresh();
  }

  async function cancel() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/events/${eventSlug}/registrations`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.message || data.error || "Не удалось отменить регистрацию.");
      return;
    }
    setStatus("CANCELLED");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-1.5">
      {status && (status !== "CANCELLED" || isDecidedByOrganizer) && (
        <p className="m-0 text-sm font-semibold text-night-text">{STATUS_LABEL[status]}</p>
      )}

      {isDecidedByOrganizer ? null : isActive ? (
        <Button
          variant="ghost"
          disabled={loading}
          onClick={cancel}
          type="button"
          className="border border-night-border bg-transparent text-night-text hover:bg-night-card2"
        >
          Отменить регистрацию
        </Button>
      ) : (
        <Button
          disabled={loading}
          onClick={register}
          type="button"
          className="border-none bg-gradient-night-cta"
        >
          Зарегистрироваться
        </Button>
      )}

      {error && <p className="m-0 text-xs text-red-400">{error}</p>}
    </div>
  );
}
