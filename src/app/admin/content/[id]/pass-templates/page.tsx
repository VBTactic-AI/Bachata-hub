import { redirect } from "next/navigation";
import { getCurrentUser, canCreateEvents } from "@/lib/auth";
import { listPassTemplatesForUser } from "@/server/events/pass-template-service";
import { PassTemplateManager } from "@/components/admin/events/PassTemplateManager";

// Вкладка "Шаблоны Pass" в карточке события (2026-09-16, по прямому запросу
// пользователя) — раньше была отдельной, полностью самостоятельной страницей
// (/admin/content/pass-templates, вне [id]/layout.tsx), из-за чего клик по
// вкладке "выбивал" организатора из карточки события (другой заголовок, нет
// EventDashboardTabs). Теперь это обычная вложенная вкладка, как
// registrations/team/statistics, — заголовок/бейджи/EventDashboardTabs
// рендерятся один раз в [id]/layout.tsx.
//
// Сам список шаблонов НЕ зависит от того, в карточке какого события открыта
// вкладка — PassTemplate принадлежит User, не Event (см. комментарий у
// модели в schema.prisma) — тот же список показывается из любой карточки.
export default async function EventPassTemplatesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canCreateEvents(user)) redirect("/admin/content");

  const templates = await listPassTemplatesForUser(user);

  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-sm text-admin-muted">
        Готовые настройки Pass, которые можно переиспользовать при создании нового Pass на любом вашем событии.
      </p>

      <PassTemplateManager
        templates={templates.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          type: t.type,
          price: t.price == null ? null : Number(t.price),
          currency: t.currency,
          quantity: t.quantity,
          imageUrl: t.imageUrl,
          allowMultipleEntry: t.allowMultipleEntry,
        }))}
      />
    </div>
  );
}
