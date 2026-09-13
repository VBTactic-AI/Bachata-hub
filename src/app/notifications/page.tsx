import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listNotifications } from "@/server/notifications/notification-center";
import { NotificationCenterList } from "@/components/notifications/NotificationCenterList";

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { notifications, nextCursor } = await listNotifications(user.id, { limit: 20 });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="m-0 font-night text-xl font-extrabold tracking-tight text-night-text">Уведомления</h1>
      <NotificationCenterList
        initialNotifications={notifications.map((n) => ({
          id: n.id,
          type: n.type,
          priority: n.priority,
          title: n.title,
          body: n.body,
          deepLink: n.deepLink,
          isRead: n.isRead,
          createdAt: n.createdAt.toISOString(),
        }))}
        initialCursor={nextCursor}
      />
    </div>
  );
}
