import { prisma } from "@/lib/prisma";

// Notification & Subscription Engine — Notification Center backend
// (Phase 4, ТЗ §9). UI (колокольчик/страница уведомлений) — Phase 8.

export class NotificationNotFoundError extends Error {}

export async function listNotifications(
  userId: string,
  opts: { unreadOnly?: boolean; cursor?: string; limit?: number } = {}
) {
  const limit = Math.min(opts.limit ?? 20, 100);

  const notifications = await prisma.notification.findMany({
    where: { userId, ...(opts.unreadOnly ? { isRead: false } : {}) },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });

  const hasMore = notifications.length > limit;
  const page = hasMore ? notifications.slice(0, limit) : notifications;
  return { notifications: page, nextCursor: hasMore ? page[page.length - 1]!.id : null };
}

export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, isRead: false } });
}

// userId в where — ownership-проверка прямо в запросе, как и в
// Subscription Engine (нельзя пометить прочитанным чужое уведомление).
export async function markAsRead(userId: string, notificationId: string): Promise<void> {
  const result = await prisma.notification.updateMany({
    where: { id: notificationId, userId },
    data: { isRead: true, readAt: new Date() },
  });
  if (result.count === 0) throw new NotificationNotFoundError();
}

export async function markAllAsRead(userId: string): Promise<number> {
  const result = await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
  return result.count;
}
