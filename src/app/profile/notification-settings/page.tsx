import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getOrCreateNotificationPreference } from "@/server/notifications/preferences";
import { NotificationPreferencesForm } from "@/components/notifications/NotificationPreferencesForm";

export default async function NotificationSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const preference = await getOrCreateNotificationPreference(user.id);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="m-0 font-night text-xl font-extrabold tracking-tight text-night-text">Настройки уведомлений</h1>
      <NotificationPreferencesForm
        initialPreference={{
          eventFormatsEnabled: preference.eventFormatsEnabled,
          notifyReminders: preference.notifyReminders,
          reminderHoursBefore: preference.reminderHoursBefore,
          notifyChanges: preference.notifyChanges,
          notifyCancellations: preference.notifyCancellations,
          channelsEnabled: preference.channelsEnabled,
          emailFrequency: preference.emailFrequency,
        }}
      />
    </div>
  );
}
