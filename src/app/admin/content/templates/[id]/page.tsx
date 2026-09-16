import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, canCreateEvents } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEventTemplate, EventTemplateNotFoundError, EventTemplateForbiddenError } from "@/server/events/event-template-service";
import { EventTemplateEditor } from "@/components/admin/events/EventTemplateEditor";

// Просмотр/редактирование уже созданного шаблона (2026-09-16, по прямому
// запросу пользователя — раньше из /admin/content/templates можно было
// только создать событие из шаблона/дублировать/архивировать, но не
// посмотреть или поправить сам шаблон). ОДНА страница без степпера — см.
// комментарий у EventTemplateEditor.
export default async function EventTemplateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canCreateEvents(user)) redirect("/admin");

  const { id } = await params;

  let template;
  try {
    template = await getEventTemplate(id, user);
  } catch (e) {
    if (e instanceof EventTemplateNotFoundError) notFound();
    if (e instanceof EventTemplateForbiddenError) redirect("/admin/content/templates");
    throw e;
  }

  const cities = await prisma.city.findMany({ where: { isActive: true }, orderBy: { nameRu: "asc" } });

  return (
    <div className="flex flex-col gap-4">
      <Link href="/admin/content/templates" className="text-sm text-admin-muted hover:text-night-text hover:underline">
        ← К списку шаблонов
      </Link>

      <div>
        <h1 className="m-0 font-night text-xl font-extrabold text-night-text sm:text-2xl">{template.name}</h1>
        <p className="m-0 mt-1 text-sm text-admin-muted">Заготовка настроек события — изменения не затрагивают уже созданные ранее события.</p>
      </div>

      <EventTemplateEditor
        template={{
          id: template.id,
          name: template.name,
          description: template.description,
          format: template.format,
          level: template.level,
          cityId: template.cityId,
          venueName: template.venueName,
          venueAddress: template.venueAddress,
          defaultStartTime: template.defaultStartTime,
          defaultEndTime: template.defaultEndTime,
          ticketingMode: template.ticketingMode,
          registrationEnabled: template.registrationEnabled,
          capacity: template.capacity,
          priceText: template.priceText,
          externalLinkUrl: template.externalLinkUrl,
          tags: template.tags,
          ticketTypes: template.ticketTypes.map((t) => ({ name: t.name, description: t.description, price: t.price == null ? null : Number(t.price), currency: t.currency, quantity: t.quantity })),
          passes: template.passes.map((p) => ({
            name: p.name,
            description: p.description,
            price: p.price == null ? null : Number(p.price),
            currency: p.currency,
            quantity: p.quantity,
            type: p.type,
            imageUrl: p.imageUrl,
            allowMultipleEntry: p.allowMultipleEntry,
          })),
        }}
        cities={cities.map((c) => ({ id: c.id, nameRu: c.nameRu }))}
      />
    </div>
  );
}
