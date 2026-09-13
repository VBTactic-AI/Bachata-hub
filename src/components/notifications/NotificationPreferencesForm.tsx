"use client";

import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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

export function NotificationPreferencesForm({
  initialPreference,
  initialTelegramLinked,
}: {
  initialPreference: Preference;
  initialTelegramLinked: boolean;
}) {
  const [pref, setPref] = useState(initialPreference);
  const [error, setError] = useState<string | null>(null);
  const [webPushBusy, setWebPushBusy] = useState(false);

  const [telegramLinked, setTelegramLinked] = useState(initialTelegramLinked);
  const [telegramLinking, setTelegramLinking] = useState(false);
  const [telegramBusy, setTelegramBusy] = useState(false);
  const [telegramError, setTelegramError] = useState<string | null>(null);
  const prefRef = useRef(pref);
  prefRef.current = pref;

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

  // Telegram — привязка происходит в ДРУГОМ приложении (пользователь жмёт
  // Start в Telegram), эта вкладка о результате узнать сама не может — тот
  // же приём поллинга, что уже используется в проекте для низкочастотных
  // живых данных (ротация/админ-лента), не Supabase Realtime. Останавливается
  // через 60с сама, если человек не успел/передумал — открыть ссылку можно
  // ещё раз.
  async function startTelegramLink() {
    setTelegramError(null);
    setTelegramBusy(true);
    const res = await fetch("/api/notification-endpoints/telegram", { method: "POST" });
    setTelegramBusy(false);
    if (!res.ok) {
      setTelegramError(
        res.status === 503 ? "Telegram пока не настроен на сервере." : "Не удалось начать привязку, попробуйте ещё раз."
      );
      return;
    }
    const data = await res.json();
    window.open(data.deepLink, "_blank", "noopener,noreferrer");
    setTelegramLinking(true);
  }

  useEffect(() => {
    if (!telegramLinking) return;

    const interval = setInterval(async () => {
      const res = await fetch("/api/notification-endpoints/telegram");
      if (!res.ok) return;
      const data = await res.json();
      if (data.linked) {
        setTelegramLinked(true);
        setTelegramLinking(false);
        save({ channelsEnabled: [...prefRef.current.channelsEnabled, "TELEGRAM"] });
      }
    }, 2000);

    const timeout = setTimeout(() => setTelegramLinking(false), 60_000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [telegramLinking]);

  async function unlinkTelegram() {
    setTelegramError(null);
    setTelegramBusy(true);
    const res = await fetch("/api/notification-endpoints/telegram", { method: "DELETE" });
    setTelegramBusy(false);
    if (!res.ok) {
      setTelegramError("Не удалось отключить Telegram.");
      return;
    }
    setTelegramLinked(false);
    save({ channelsEnabled: pref.channelsEnabled.filter((c) => c !== "TELEGRAM") });
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
          {telegramLinked ? (
            <label className="flex items-center gap-2 text-sm text-night-text">
              <input type="checkbox" checked={pref.channelsEnabled.includes("TELEGRAM")} onChange={() => toggleChannel("TELEGRAM")} />
              Telegram <span className="text-xs text-night-success">(подключён)</span>
            </label>
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-sm text-night-text">
              <span>Telegram</span>
              <Button type="button" size="sm" variant="secondary" disabled={telegramBusy || telegramLinking} onClick={startTelegramLink}>
                {telegramLinking ? "Ждём подтверждения в Telegram…" : telegramBusy ? "Открываем…" : "Подключить"}
              </Button>
            </div>
          )}
        </div>
        {telegramError && <p className="m-0 mt-1 text-xs text-red-400">{telegramError}</p>}
        {telegramLinked && (
          <button
            type="button"
            disabled={telegramBusy}
            onClick={unlinkTelegram}
            className="mt-1 self-start bg-transparent p-0 text-xs text-night-muted underline hover:text-night-text"
          >
            Отключить Telegram
          </button>
        )}
        <p className="m-0 mt-2 text-xs text-night-muted">
          Browser Push при включении спросит разрешение браузера — уведомления пока приходят с общим текстом
          («у вас новое уведомление»), без деталей конкретного события. Email отправляется, только если организатор
          проекта настроил почтовый сервис. Telegram: после клика «Подключить» откроется чат с ботом — нажмите там
          Start, страница сама заметит подтверждение в течение минуты.
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
