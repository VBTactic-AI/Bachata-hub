"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { subscribeToWebPush, unsubscribeFromWebPush, WebPushError } from "@/lib/notifications/web-push-client";

type EventFormat = "PARTY" | "MASTERCLASS" | "FESTIVAL" | "CONTEST" | "INTENSIVE";
type EmailFrequency = "IMMEDIATE" | "DAILY_DIGEST" | "WEEKLY_DIGEST";

type Preference = {
  eventFormatsEnabled: EventFormat[];
  notifyReminders: boolean;
  reminderHoursBefore: number[];
  notifyChanges: boolean;
  notifyCancellations: boolean;
  channelsEnabled: string[];
  emailFrequency: EmailFrequency;
};

const FORMAT_LABELS: Record<EventFormat, string> = {
  PARTY: "Вечеринки",
  MASTERCLASS: "Мастер-классы",
  FESTIVAL: "Фестивали",
  CONTEST: "Конкурсы (JNJ)",
  INTENSIVE: "Воркшоп-интенсивы",
};

const rowClass = "flex items-center gap-2 text-sm text-night-text";
const sectionTitleClass = "m-0 mb-2 font-night text-sm font-bold text-night-text";

// Notification & Subscription Engine — страница "Настройки уведомлений"
// (Phase 8, ТЗ §7). Автосохранение на каждое изменение (PATCH сразу, без
// отдельной кнопки "Сохранить") — optimistic UI, откат при ошибке.
const WEB_PUSH_ERROR_MESSAGES: Record<WebPushError["code"], string> = {
  unsupported: "Ваш браузер не поддерживает push-уведомления.",
  permission_denied: "Разрешение на уведомления не выдано — включите его в настройках браузера.",
  no_vapid_key: "Push временно недоступен на сервере (не настроены ключи).",
  server_error: "Не удалось сохранить подписку на сервере.",
};

export function NotificationPreferencesForm({ initialPreference }: { initialPreference: Preference }) {
  const [pref, setPref] = useState(initialPreference);
  const [error, setError] = useState<string | null>(null);
  const [webPushBusy, setWebPushBusy] = useState(false);

  async function save(patch: Partial<Preference>) {
    const prev = pref;
    const next = { ...pref, ...patch };
    setPref(next);
    setError(null);
    const res = await fetch("/api/notification-preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      setPref(prev);
      setError("Не удалось сохранить, попробуйте ещё раз.");
    }
  }

  function toggleFormat(format: EventFormat) {
    const has = pref.eventFormatsEnabled.includes(format);
    const next = has ? pref.eventFormatsEnabled.filter((f) => f !== format) : [...pref.eventFormatsEnabled, format];
    save({ eventFormatsEnabled: next });
  }

  function toggleReminderHour(hour: number) {
    const has = pref.reminderHoursBefore.includes(hour);
    const next = has ? pref.reminderHoursBefore.filter((h) => h !== hour) : [...pref.reminderHoursBefore, hour];
    save({ reminderHoursBefore: next });
  }

  function toggleChannel(channel: string) {
    const has = pref.channelsEnabled.includes(channel);
    const next = has ? pref.channelsEnabled.filter((c) => c !== channel) : [...pref.channelsEnabled, channel];
    save({ channelsEnabled: next });
  }

  // Web Push — отдельная логика: включение требует реального разрешения
  // браузера и подписки PushManager, не только флага в NotificationPreference
  // (см. web-push-client.ts). Если пользователь отменит разрешение позже,
  // preference так и останется "включено" — сервер узнает об этом только
  // когда push реально не дойдёт (см. web-push-provider.ts, отключение
  // endpoint'а по 410).
  async function toggleWebPush(enable: boolean) {
    setError(null);
    setWebPushBusy(true);
    try {
      if (enable) {
        await subscribeToWebPush();
      } else {
        await unsubscribeFromWebPush();
      }
      await save({ channelsEnabled: enable ? [...pref.channelsEnabled, "WEB_PUSH"] : pref.channelsEnabled.filter((c) => c !== "WEB_PUSH") });
    } catch (err) {
      if (err instanceof WebPushError) setError(WEB_PUSH_ERROR_MESSAGES[err.code]);
      else setError("Не удалось изменить настройку Browser Push.");
    } finally {
      setWebPushBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="m-0 text-sm text-red-400">{error}</p>}

      <Card className="border-night-border bg-night-card">
        <h2 className={sectionTitleClass}>Новые события</h2>
        <div className="flex flex-col gap-1.5">
          {(Object.keys(FORMAT_LABELS) as EventFormat[]).map((format) => (
            <label key={format} className={rowClass}>
              <input
                type="checkbox"
                checked={pref.eventFormatsEnabled.includes(format)}
                onChange={() => toggleFormat(format)}
              />
              {FORMAT_LABELS[format]}
            </label>
          ))}
        </div>
        <p className="m-0 mt-2 text-xs text-night-muted">
          Применяется к событиям из городов/школ, на которые вы подписаны. Чтобы получать ВСЕ события конкретного
          формата — подпишитесь на него отдельно на странице «Мои подписки».
        </p>
      </Card>

      <Card className="border-night-border bg-night-card">
        <h2 className={sectionTitleClass}>Напоминания</h2>
        <div className="flex flex-col gap-1.5">
          <label className={rowClass}>
            <input
              type="checkbox"
              checked={pref.notifyReminders}
              onChange={(e) => save({ notifyReminders: e.target.checked })}
            />
            Напоминать о предстоящих событиях
          </label>
          {pref.notifyReminders && (
            <div className="ml-6 flex flex-col gap-1.5">
              <label className={rowClass}>
                <input
                  type="checkbox"
                  checked={pref.reminderHoursBefore.includes(24)}
                  onChange={() => toggleReminderHour(24)}
                />
                За 24 часа
              </label>
              <label className={rowClass}>
                <input
                  type="checkbox"
                  checked={pref.reminderHoursBefore.includes(2)}
                  onChange={() => toggleReminderHour(2)}
                />
                За 2 часа
              </label>
            </div>
          )}
        </div>
      </Card>

      <Card className="border-night-border bg-night-card">
        <h2 className={sectionTitleClass}>Изменения</h2>
        <div className="flex flex-col gap-1.5">
          <label className={rowClass}>
            <input
              type="checkbox"
              checked={pref.notifyChanges}
              onChange={(e) => save({ notifyChanges: e.target.checked })}
            />
            Изменение времени или места
          </label>
          <label className={rowClass}>
            <input
              type="checkbox"
              checked={pref.notifyCancellations}
              onChange={(e) => save({ notifyCancellations: e.target.checked })}
            />
            Отмена события
          </label>
        </div>
      </Card>

      <Card className="border-night-border bg-night-card">
        <h2 className={sectionTitleClass}>Каналы</h2>
        <div className="flex flex-col gap-1.5">
          <label className={rowClass}>
            <input type="checkbox" checked readOnly />
            Уведомления на сайте
          </label>
          <label className="flex items-center gap-2 text-sm text-night-text">
            <input
              type="checkbox"
              disabled={webPushBusy}
              checked={pref.channelsEnabled.includes("WEB_PUSH")}
              onChange={(e) => toggleWebPush(e.target.checked)}
            />
            Browser Push
          </label>
          <label className="flex items-center gap-2 text-sm text-night-text">
            <input type="checkbox" checked={pref.channelsEnabled.includes("EMAIL")} onChange={() => toggleChannel("EMAIL")} />
            Email
          </label>
          <label className="flex items-center gap-2 text-sm text-night-muted">
            <input type="checkbox" disabled checked={false} />
            Telegram <span className="text-xs">(скоро)</span>
          </label>
        </div>
        <p className="m-0 mt-2 text-xs text-night-muted">
          Browser Push при включении спросит разрешение браузера — уведомления пока приходят с общим текстом
          («у вас новое уведомление»), без деталей конкретного события. Email отправляется, только если организатор
          проекта настроил почтовый сервис.
        </p>
      </Card>

      <Card className="border-night-border bg-night-card">
        <h2 className={sectionTitleClass}>Email frequency</h2>
        <div className="flex flex-col gap-1.5">
          {(
            [
              ["IMMEDIATE", "Immediately"],
              ["DAILY_DIGEST", "Daily digest"],
              ["WEEKLY_DIGEST", "Weekly digest"],
            ] as [EmailFrequency, string][]
          ).map(([value, label]) => (
            <label key={value} className={rowClass}>
              <input
                type="radio"
                name="emailFrequency"
                checked={pref.emailFrequency === value}
                onChange={() => save({ emailFrequency: value })}
              />
              {label}
            </label>
          ))}
        </div>
      </Card>
    </div>
  );
}
