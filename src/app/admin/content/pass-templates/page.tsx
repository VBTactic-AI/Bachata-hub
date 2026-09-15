import { redirect } from "next/navigation";
import { getCurrentUser, canCreateEvents } from "@/lib/auth";
import { listPassTemplatesForUser } from "@/server/events/pass-template-service";
import { PassTemplateManager } from "@/components/admin/events/PassTemplateManager";

// Шаблоны Pass организатора (2026-09-16) — не привязаны к событию, см.
// комментарий у модели PassTemplate в schema.prisma.
export default async function PassTemplatesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canCreateEvents(user)) redirect("/admin/content");

  const templates = await listPassTemplatesForUser(user);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <a href="/admin/content" className="text-sm text-admin-muted hover:text-night-text hover:underline">
          ← К моим событиям
        </a>
        <h1 className="m-0 mt-1 font-night text-xl font-extrabold text-night-text sm:text-2xl">Шаблоны Pass</h1>
        <p className="m-0 mt-1 text-sm text-admin-muted">
          Готовые настройки Pass, которые можно переиспользовать при создании нового Pass на любом вашем событии.
        </p>
      </div>

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
