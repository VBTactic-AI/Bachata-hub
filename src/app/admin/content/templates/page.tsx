import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, canCreateEvents } from "@/lib/auth";
import { listEventTemplatesForUser } from "@/server/events/event-template-service";
import { EVENT_TYPE_REGISTRY } from "@/lib/events/event-type-registry";
import { PostActionButton } from "@/components/admin/events/PostActionButton";
import { CopyIcon, ArchiveBoxIcon, PlayIcon } from "@/components/admin/icons";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/cn";

// Список шаблонов (Recurring Events v2). Новый шаблон НЕ создаётся пустой
// формой — кнопка "Новый шаблон" ведёт в обычный Create Event Wizard, где на
// шаге "Публикация" организатор отмечает "Сохранить как шаблон" (см.
// комментарий у createEventTemplateFromEvent,
// src/server/events/event-template-service.ts).
export default async function EventTemplatesListPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canCreateEvents(user)) redirect("/admin");

  const templates = await listEventTemplatesForUser(user, true);
  const active = templates.filter((t) => t.status === "ACTIVE");
  const archived = templates.filter((t) => t.status === "ARCHIVED");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="m-0 font-night text-xl font-extrabold text-night-text sm:text-2xl">Шаблоны событий</h1>
          <p className="m-0 mt-1 max-w-prose text-sm text-admin-muted">
            Заготовка настроек события. Новый шаблон тоже создаётся через обычное создание события — отметьте «Сохранить как шаблон» на шаге
            «Публикация».
          </p>
        </div>
        <Link href="/admin/content/new" className={cn(buttonVariants({ variant: "admin", size: "sm" }), "no-underline")}>
          Новый шаблон
        </Link>
      </div>

      {templates.length === 0 ? (
        <p className="text-sm text-admin-muted">Шаблонов пока нет.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {active.map((t) => (
            <div key={t.id} className="flex flex-col gap-2.5 rounded-app border border-admin-border bg-admin-card p-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-app-sm bg-admin-primary/15 text-lg" aria-hidden="true">
                {EVENT_TYPE_REGISTRY[t.format].icon}
              </div>
              <div>
                <h3 className="m-0 text-sm font-bold text-night-text">{t.name}</h3>
                <p className="m-0 text-xs text-admin-muted">
                  {EVENT_TYPE_REGISTRY[t.format].label}
                  {t.venueName ? ` · ${t.venueName}` : ""}
                </p>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <Link
                  href={`/admin/content/new?templateId=${t.id}`}
                  className={cn(buttonVariants({ variant: "adminOutline", size: "sm" }), "no-underline")}
                >
                  Создать событие
                </Link>
                <PostActionButton endpoint={`/api/event-templates/${t.id}/duplicate`} icon={<CopyIcon />} label="Дублировать" />
                <PostActionButton
                  endpoint={`/api/event-templates/${t.id}/archive`}
                  icon={<ArchiveBoxIcon />}
                  label="Архивировать"
                  tone="danger"
                  confirmText={`Архивировать шаблон «${t.name}»?`}
                />
              </div>
            </div>
          ))}

          {archived.map((t) => (
            <div key={t.id} className="flex flex-col gap-2.5 rounded-app border border-admin-border bg-admin-card p-4 opacity-60">
              <div className="flex h-9 w-9 items-center justify-center rounded-app-sm bg-admin-card2 text-lg" aria-hidden="true">
                {EVENT_TYPE_REGISTRY[t.format].icon}
              </div>
              <div>
                <h3 className="m-0 text-sm font-bold text-night-text">{t.name}</h3>
                <p className="m-0 text-xs text-admin-muted">В архиве</p>
              </div>
              <div className="mt-1">
                <PostActionButton endpoint={`/api/event-templates/${t.id}/unarchive`} icon={<PlayIcon />} label="Восстановить" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
