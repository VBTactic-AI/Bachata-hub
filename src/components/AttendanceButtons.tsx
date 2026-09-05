"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { t } from "@/lib/i18n/dictionary";
import { Button } from "@/components/ui/button";

export function AttendanceButtons({
  eventSlug,
  initialStatus,
  loggedIn,
}: {
  eventSlug: string;
  initialStatus: "GOING" | "WENT" | null;
  loggedIn: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [loading, setLoading] = useState(false);

  if (!loggedIn) {
    return (
      <p className="text-sm text-night-muted">
        <a href="/login" className="text-night-primary">
          {t.nav.login}
        </a>
        , чтобы отметить «{t.event.imGoing.toLowerCase()}» или «
        {t.event.iWent.toLowerCase()}».
      </p>
    );
  }

  async function mark(next: "GOING" | "WENT") {
    setLoading(true);
    await fetch(`/api/events/${eventSlug}/attendance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setStatus(next);
    setLoading(false);
    router.refresh();
  }

  async function clear() {
    setLoading(true);
    await fetch(`/api/events/${eventSlug}/attendance`, { method: "DELETE" });
    setStatus(null);
    setLoading(false);
    router.refresh();
  }

  const activeClass = "border-none bg-gradient-night-cta";
  const inactiveClass = "border-night-border bg-transparent text-night-text hover:bg-night-card2";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant={status === "GOING" ? "default" : "secondary"}
        disabled={loading}
        onClick={() => mark("GOING")}
        type="button"
        className={status === "GOING" ? activeClass : inactiveClass}
      >
        {t.event.imGoing}
      </Button>
      <Button
        variant={status === "WENT" ? "default" : "secondary"}
        disabled={loading}
        onClick={() => mark("WENT")}
        type="button"
        className={status === "WENT" ? activeClass : inactiveClass}
      >
        {t.event.iWent}
      </Button>
      {status && (
        <Button variant="ghost" disabled={loading} onClick={clear} type="button" className="text-night-muted hover:text-night-text">
          {t.event.cancelMark}
        </Button>
      )}
    </div>
  );
}
