"use client";

import { useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type SubscriptionType = "EVENT" | "SCHOOL" | "CITY" | "COUNTRY" | "EVENT_TYPE" | "INSTRUCTOR";
type EventFormat = "PARTY" | "MASTERCLASS" | "FESTIVAL" | "CONTEST" | "INTENSIVE";

export type SubscriptionItem = {
  id: string;
  type: SubscriptionType;
  targetId: string;
  label: string;
  href?: string;
};

const GROUP_TITLES: Record<Exclude<SubscriptionType, "EVENT_TYPE">, string> = {
  SCHOOL: "Школы",
  EVENT: "События",
  CITY: "Города",
  COUNTRY: "Страны",
  INSTRUCTOR: "Преподаватели",
};

const FORMAT_LABELS: Record<EventFormat, string> = {
  PARTY: "Вечеринки",
  MASTERCLASS: "Мастер-классы",
  FESTIVAL: "Фестивали",
  CONTEST: "Конкурсы (JNJ)",
  INTENSIVE: "Воркшоп-интенсивы",
};

// Notification & Subscription Engine — "Мои подписки" (Phase 8, ТЗ §36).
// Follow/Unfollow конкретных школ/событий/преподавателей делается на их
// собственных страницах (FollowButton) — здесь только обзор+отписка и
// добавление CITY/EVENT_TYPE, для которых отдельной страницы-сущности нет.
export function SubscriptionsManager({
  initialItems,
  activeCities,
}: {
  initialItems: SubscriptionItem[];
  activeCities: { id: string; nameRu: string }[];
}) {
  const [items, setItems] = useState(initialItems);
  const [error, setError] = useState<string | null>(null);

  async function unsubscribe(id: string) {
    const prev = items;
    setItems((cur) => cur.filter((i) => i.id !== id));
    setError(null);
    const res = await fetch(`/api/subscriptions/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setItems(prev);
      setError("Не удалось отписаться, попробуйте ещё раз.");
    }
  }

  async function subscribe(type: SubscriptionType, targetId: string, label: string) {
    setError(null);
    const res = await fetch("/api/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, targetId }),
    });
    if (res.ok) {
      const data = await res.json();
      setItems((cur) => [...cur, { id: data.subscription.id, type, targetId, label }]);
    } else {
      setError("Не удалось подписаться, попробуйте ещё раз.");
    }
  }

  const byType = (type: SubscriptionType) => items.filter((i) => i.type === type);
  const followedCityIds = new Set(byType("CITY").map((i) => i.targetId));
  const followedFormats = new Set(byType("EVENT_TYPE").map((i) => i.targetId));
  const availableCities = activeCities.filter((c) => !followedCityIds.has(c.id));

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="m-0 text-sm text-red-400">{error}</p>}

      {(["SCHOOL", "EVENT", "INSTRUCTOR"] as const).map((type) => {
        const group = byType(type);
        if (group.length === 0) return null;
        return (
          <Card key={type} className="border-night-border bg-night-card">
            <h2 className="m-0 mb-2 font-night text-sm font-bold text-night-text">{GROUP_TITLES[type]}</h2>
            <div className="flex flex-col gap-1.5">
              {group.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-2 text-sm">
                  {item.href ? (
                    <Link href={item.href} className="text-night-text no-underline hover:text-night-primary">
                      {item.label}
                    </Link>
                  ) : (
                    <span className="text-night-text">{item.label}</span>
                  )}
                  <button type="button" onClick={() => unsubscribe(item.id)} className="border-none bg-transparent text-xs text-night-muted hover:text-red-400">
                    Отписаться
                  </button>
                </div>
              ))}
            </div>
          </Card>
        );
      })}

      <Card className="border-night-border bg-night-card">
        <h2 className="m-0 mb-2 font-night text-sm font-bold text-night-text">Города</h2>
        <div className="flex flex-col gap-1.5">
          {byType("CITY").map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-night-text">{item.label}</span>
              <button type="button" onClick={() => unsubscribe(item.id)} className="border-none bg-transparent text-xs text-night-muted hover:text-red-400">
                Отписаться
              </button>
            </div>
          ))}
          {byType("CITY").length === 0 && <p className="m-0 text-sm text-night-muted">Вы не подписаны ни на один город.</p>}
        </div>
        {availableCities.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {availableCities.map((c) => (
              <Button
                key={c.id}
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => subscribe("CITY", c.id, c.nameRu)}
                className="border-night-border text-night-text"
              >
                + {c.nameRu}
              </Button>
            ))}
          </div>
        )}
      </Card>

      <Card className="border-night-border bg-night-card">
        <h2 className="m-0 mb-2 font-night text-sm font-bold text-night-text">Типы событий</h2>
        <p className="m-0 mb-2 text-xs text-night-muted">
          Получать уведомления обо ВСЕХ событиях выбранного формата — в любом городе, независимо от подписки на
          город/школу.
        </p>
        <div className="flex flex-col gap-1.5">
          {(Object.keys(FORMAT_LABELS) as EventFormat[]).map((format) => {
            const existing = byType("EVENT_TYPE").find((i) => i.targetId === format);
            return (
              <label key={format} className="flex items-center gap-2 text-sm text-night-text">
                <input
                  type="checkbox"
                  checked={followedFormats.has(format)}
                  onChange={() => (existing ? unsubscribe(existing.id) : subscribe("EVENT_TYPE", format, FORMAT_LABELS[format]))}
                />
                {FORMAT_LABELS[format]}
              </label>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
