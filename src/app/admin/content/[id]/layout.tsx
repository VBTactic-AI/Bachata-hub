import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasEventAccess, isOwnerOrAdmin } from "@/server/events/access";
import { myEventStatusLabel } from "@/lib/events/event-type-registry";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { EventDashboardTabs } from "@/components/admin/events/EventDashboardTabs";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/cn";

// §12 ТЗ (Event Dashboard, 2026-09-15) — единая оболочка ОДНОГО события:
// раньше "Участники" (registrations/page.tsx, §11) и "Команда" (team/
// page.tsx, этап 5) были двумя несвязанными страницами без общего меню и
// без общей проверки доступа. Доступ проверяется здесь ОДИН раз для всего
// поддерева — hasEventAccess (владелец/ADMIN/любой член команды, см.
// access.ts) допускает к "Обзору"/"Участникам"; "Команда" и кнопка
// "Редактировать" видны только владельцу/ADMIN (isOwnerOrAdmin) — team-service.ts
// и event-service.ts сами это требуют, скрывать пункт меню, ведущий на 403,
// смысла нет. Дочерние страницы (page.tsx/registrations/team) по-прежнему
// делают свою собственную проверку через сервисные функции — это
// оправданный defense-in-depth (CLAUDE.md §31), не дублирование логики: они
// вызываются и напрямую через API, не только через эту оболочку.
export default async function EventDashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const event = await prisma.event.findUnique({
    where: { id },
    select: { id: true, slug: true, title: true, createdById: true, status: true, moderationStatus: true, certainty: true },
  });
  if (!event) notFound();
  if (!(await hasEventAccess(event, user))) redirect("/admin/content");

  const canManage = isOwnerOrAdmin(event, user);
  const isLive = event.status === "PUBLISHED" && event.moderationStatus === "APPROVED";

  return (
    <div className="flex flex-col gap-4">
      <div>
        <a href="/admin/content" className="text-sm text-admin-muted hover:text-night-text hover:underline">
          ← К моим событиям
        </a>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="m-0 font-night text-xl font-extrabold text-night-text sm:text-2xl">{event.title || "Без названия"}</h1>
          <StatusBadge
            label={myEventStatusLabel(event.status, event.moderationStatus)}
            variant={isLive ? "success" : event.moderationStatus === "REJECTED" ? "danger" : "neutral"}
          />
          {event.certainty === "TENTATIVE" && <StatusBadge label="Дата уточняется" variant="warning" />}
        </div>
        <div className="mt-2 flex flex-wrap gap-3 text-sm">
          {canManage && (
            // Сделана более заметной (2026-09-16, по прямому запросу
            // пользователя) — раньше выглядела как второстепенная (adminOutline),
            // хотя это основное действие в этом хедере.
            <a href={`/admin/content/edit/${event.id}`} className={cn(buttonVariants({ variant: "admin" }), "no-underline")}>
              ✎ Редактировать
            </a>
          )}
          {isLive && (
            <a
              href={`/events/${event.slug}`}
              target="_blank"
              className="inline-flex items-center text-admin-muted hover:text-night-text hover:underline"
            >
              Открыть карточку на сайте →
            </a>
          )}
        </div>
      </div>

      <EventDashboardTabs eventId={event.id} canManageTeam={canManage} />

      {children}
    </div>
  );
}
