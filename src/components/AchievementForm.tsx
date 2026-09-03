"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { t } from "@/lib/i18n/dictionary";
import { Button } from "@/components/ui/button";
import { FormRoot, Input, Label, Select } from "@/components/ui/field";

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
      <Button variant="secondary" size="sm" type="button" onClick={() => setOpen(true)}>
        {t.dancer.addAchievement}
      </Button>
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
    <FormRoot onSubmit={onSubmit} className="rounded-app border border-line bg-surface p-[18px] shadow-sm">
      <Label>
        {t.dancer.achievementDescription}
        <Input
          required
          placeholder={t.dancer.achievementPlaceholder}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Label>
      <Label>
        {t.dancer.achievementDate}
        <Input type="date" required value={achievedAt} onChange={(e) => setAchievedAt(e.target.value)} />
      </Label>
      <Label>
        {t.dancer.achievementEventLabel}
        <Select value={eventId} onChange={(e) => setEventId(e.target.value)}>
          <option value="">{t.dancer.achievementNoEvent}</option>
          {attendedEvents.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.title}
            </option>
          ))}
        </Select>
      </Label>
      {error && <p className="error-text">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" type="submit" disabled={loading}>
          {t.common.save}
        </Button>
        <Button variant="secondary" size="sm" type="button" onClick={() => setOpen(false)}>
          {t.common.cancel}
        </Button>
      </div>
    </FormRoot>
  );
}
