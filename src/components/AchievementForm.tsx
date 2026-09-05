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
      <Button
        variant="secondary"
        size="sm"
        type="button"
        onClick={() => setOpen(true)}
        className="border-night-border bg-transparent text-night-text hover:bg-night-card2"
      >
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

  const selectClass = "border-night-border bg-night-card2 text-night-text focus:border-night-primary focus:ring-night-primary/20";

  return (
    <FormRoot onSubmit={onSubmit} className="max-w-none rounded-app border border-night-border bg-night-card p-[18px]">
      <Label className="text-night-muted">
        {t.dancer.achievementDescription}
        <Input
          required
          placeholder={t.dancer.achievementPlaceholder}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={selectClass}
        />
      </Label>
      <Label className="text-night-muted">
        {t.dancer.achievementDate}
        <Input type="date" required value={achievedAt} onChange={(e) => setAchievedAt(e.target.value)} className={selectClass} />
      </Label>
      <Label className="text-night-muted">
        {t.dancer.achievementEventLabel}
        <Select value={eventId} onChange={(e) => setEventId(e.target.value)} className={selectClass}>
          <option value="">{t.dancer.achievementNoEvent}</option>
          {attendedEvents.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.title}
            </option>
          ))}
        </Select>
      </Label>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" type="submit" disabled={loading} className="border-none bg-gradient-night-cta">
          {t.common.save}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          type="button"
          onClick={() => setOpen(false)}
          className="border-night-border bg-transparent text-night-text hover:bg-night-card2"
        >
          {t.common.cancel}
        </Button>
      </div>
    </FormRoot>
  );
}
