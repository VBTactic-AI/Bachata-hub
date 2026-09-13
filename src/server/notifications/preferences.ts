import type { EventFormat, NotificationChannel, EmailFrequency } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Notification & Subscription Engine — Notification Preferences (Phase 4).
// Follow (Subscription) и Preference — разные уровни (ТЗ п.6): подписка
// решает "на что я слежу", Preference — "что именно и как мне об этом
// присылать". Один на пользователя.

const ALL_EVENT_FORMATS: EventFormat[] = ["PARTY", "MASTERCLASS", "FESTIVAL", "CONTEST", "INTENSIVE"];

export const DEFAULT_NOTIFICATION_PREFERENCE = {
  eventFormatsEnabled: ALL_EVENT_FORMATS,
  notifyReminders: true,
  reminderHoursBefore: [24, 2],
  notifyChanges: true,
  notifyCancellations: true,
  channelsEnabled: ["IN_APP"] as NotificationChannel[],
  emailFrequency: "IMMEDIATE" as EmailFrequency,
};

export type PreferenceLike = {
  eventFormatsEnabled: EventFormat[];
  notifyReminders: boolean;
  reminderHoursBefore: number[];
  notifyChanges: boolean;
  notifyCancellations: boolean;
  channelsEnabled: NotificationChannel[];
  emailFrequency: EmailFrequency;
};

// Создаёт строку с дефолтами при первом обращении (напр. открытие страницы
// настроек) — дальше PATCH обновляет уже существующую строку напрямую.
export async function getOrCreateNotificationPreference(userId: string) {
  return prisma.notificationPreference.upsert({
    where: { userId },
    create: { userId, ...DEFAULT_NOTIFICATION_PREFERENCE },
    update: {},
  });
}

export type NotificationPreferencePatch = Partial<PreferenceLike>;

export async function updateNotificationPreference(userId: string, patch: NotificationPreferencePatch) {
  return prisma.notificationPreference.upsert({
    where: { userId },
    create: { userId, ...DEFAULT_NOTIFICATION_PREFERENCE, ...patch },
    update: patch,
  });
}

// Только ЧТЕНИЕ, без побочной записи — используется Notification Engine при
// обработке job'а (Phase 4/audience-resolver), где не нужно и нежелательно
// заводить строку предпочтений каждому кандидату в аудитории только потому,
// что ему решили отправить уведомление.
export async function getPreferenceMap(userIds: string[]): Promise<Map<string, PreferenceLike>> {
  const map = new Map<string, PreferenceLike>();
  if (userIds.length === 0) return map;

  const rows = await prisma.notificationPreference.findMany({ where: { userId: { in: userIds } } });
  for (const row of rows) map.set(row.userId, row);
  for (const userId of userIds) {
    if (!map.has(userId)) map.set(userId, DEFAULT_NOTIFICATION_PREFERENCE);
  }
  return map;
}
