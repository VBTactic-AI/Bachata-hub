"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { t } from "@/lib/i18n/dictionary";

type AttendedEvent = { id: string; title: string };

export function AchievementForm({ attendedEvents }: { attendedEvents: AttendedEvent[] }) {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [achievedAt, setAchievedAt] = useState("");
  const [eventId, setEventId] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button className="btn btn-secondary btn-sm" type="button" onClick={() => setOpen(true)}>
        {t.dancer.addAchievement}
      </button>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch("/api/profile/achievements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description, achievedAt, eventId: eventId || undefined }),
    });
    setLoading(false);
    if (!res.ok) {
      setError(t.common.errorGeneric);
      return;
    }
    setOpen(false);
    setDescription("");
    setAchievedAt("");
    setEventId("");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="card">
      <label>
        {t.dancer.achievementDescription}
        <input
          required
          placeholder={t.dancer.achievementPlaceholder}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <label>
        {t.dancer.achievementDate}
        <input type="date" required value={achievedAt} onChange={(e) => setAchievedAt(e.target.value)} />
      </label>
      <label>
        {t.dancer.achievementEventLabel}
        <select value={eventId} onChange={(e) => setEventId(e.target.value)}>
          <option value="">{t.dancer.achievementNoEvent}</option>
          {attendedEvents.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.title}
            </option>
          ))}
        </select>
      </label>
      {error && <p className="error-text">{error}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-sm" type="submit" disabled={loading}>
          {t.common.save}
        </button>
        <button className="btn btn-secondary btn-sm" type="button" onClick={() => setOpen(false)}>
          {t.common.cancel}
        </button>
      </div>
    </form>
  );
}
