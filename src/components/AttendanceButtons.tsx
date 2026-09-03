"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { t } from "@/lib/i18n/dictionary";

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
      <p className="hint-text">
        <a href="/login">{t.nav.login}</a>, чтобы отметить «{t.event.imGoing.toLowerCase()}» или «
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

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <button
        className={status === "GOING" ? "btn" : "btn btn-secondary"}
        disabled={loading}
        onClick={() => mark("GOING")}
        type="button"
      >
        {t.event.imGoing}
      </button>
      <button
        className={status === "WENT" ? "btn" : "btn btn-secondary"}
        disabled={loading}
        onClick={() => mark("WENT")}
        type="button"
      >
        {t.event.iWent}
      </button>
      {status && (
        <button className="btn btn-secondary" style={{ border: "none", background: "none", boxShadow: "none", cursor: "pointer" }} disabled={loading} onClick={clear} type="button">
          {t.event.cancelMark}
        </button>
      )}
    </div>
  );
}
