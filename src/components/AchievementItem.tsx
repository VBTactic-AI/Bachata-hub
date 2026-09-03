"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { t } from "@/lib/i18n/dictionary";
import { Button } from "@/components/ui/button";
import { FormRoot, Input, Label, Select } from "@/components/ui/field";

type AttendedEvent = { id: string; title: string };

type AchievementData = {
  id: string;
  description: string;
  achievedAt: Date;
  source: "MANUAL" | "CONTEST_RESULT";
  event: { slug: string; title: string } | null;
  eventId: string | null;
};

export function AchievementItem({
  achievement,
  attendedEvents,
  editable,
}: {
  achievement: AchievementData;
  attendedEvents: AttendedEvent[];
  editable: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [description, setDescription] = useState(achievement.description);
  const [achievedAt, setAchievedAt] = useState(achievement.achievedAt.toISOString().slice(0, 10));
  const [eventId, setEventId] = useState(achievement.eventId ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Результаты будущего цифрового судейства (слой 3) — не самозаполненные
  // танцором, редактировать/удалять их из профиля нельзя.
  const canManage = editable && achievement.source === "MANUAL";

  if (editing) {
    async function onSave(e: React.FormEvent) {
      e.preventDefault();
      setError(null);
      setLoading(true);
      const res = await fetch(`/api/profile/achievements/${achievement.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, achievedAt, eventId: eventId || undefined }),
      });
      setLoading(false);
      if (!res.ok) {
        setError(t.common.errorGeneric);
        return;
      }
      setEditing(false);
      router.refresh();
    }

    return (
      <li>
        <FormRoot onSubmit={onSave} className="my-2 rounded-app border border-line bg-surface p-[18px] shadow-sm">
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
            <Button variant="secondary" size="sm" type="button" onClick={() => setEditing(false)}>
              {t.common.cancel}
            </Button>
          </div>
        </FormRoot>
      </li>
    );
  }

  async function onDelete() {
    if (!window.confirm(t.dancer.deleteAchievementConfirm)) return;
    setLoading(true);
    const res = await fetch(`/api/profile/achievements/${achievement.id}`, { method: "DELETE" });
    setLoading(false);
    if (!res.ok) {
      setError(t.common.errorGeneric);
      return;
    }
    router.refresh();
  }

  return (
    <li>
      {achievement.description}
      {achievement.event && (
        <>
          {" — "}
          <Link href={`/events/${achievement.event.slug}`}>{achievement.event.title}</Link>
        </>
      )}
      <span className="hint-text"> · {achievement.achievedAt.toLocaleDateString("ru-RU")}</span>
      {canManage && (
        <span className="ml-2 inline-flex gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            type="button"
            disabled={loading}
            onClick={() => setEditing(true)}
          >
            {t.common.edit}
          </Button>
          <Button variant="secondary" size="sm" type="button" disabled={loading} onClick={onDelete}>
            {t.common.delete}
          </Button>
        </span>
      )}
      {error && <p className="error-text">{error}</p>}
    </li>
  );
}
