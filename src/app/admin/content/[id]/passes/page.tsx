import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listPassesForEvent } from "@/server/events/pass-service";
import { listTicketTypesForEvent } from "@/server/events/ticket-type-service";
import { getEventPassRevenue, getEventTicketTypeRevenue, getEventPassAttendanceCount } from "@/server/events/ticket-service";
import { listPassTemplatesForUser } from "@/server/events/pass-template-service";
import { listPromoCodesForEvent } from "@/server/events/pass-service";
import { RegistrationForbiddenError, RegistrationNotFoundError } from "@/server/events/registration-service";
import { StatCard } from "@/components/admin/StatCard";
import { PeopleIcon, CardIcon, TargetIcon, AlertIcon } from "@/components/admin/icons";
import { PassManager } from "@/components/admin/events/PassManager";
import { TicketTypeManager } from "@/components/admin/events/TicketTypeManager";
import { TicketsAndPassesTabs } from "@/components/admin/events/TicketsAndPassesTabs";
import { PromoCodeManager } from "@/components/admin/events/PromoCodeManager";
import type { AccessTargetOption } from "@/components/admin/events/PassFormModal";
import { isOwnerOrAdmin } from "@/server/events/access";

// "🎟 Билеты и Pass" — вкладка Event Dashboard (2026-09-16, Ticket Engine v2:
// TicketType — простой билет на ОДНО событие — добавлен РЯДОМ с уже
// существующим Pass, две независимые под-вкладки одной страницы, см.
// комментарий у моделей в schema.prisma и TicketsAndPassesTabs.tsx). Owner-
// check делает listPassesForEvent/listTicketTypesForEvent (hasEventAccess —
// любой член команды видит каталог, чтобы выдавать билеты); создание/
// редактирование сами PassManager/TicketTypeManager делают через API-роуты,
// которые уже проверяют isOwnerOrAdmin.
export default async function EventPassesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const event = await prisma.event.findUnique({
    where: { id },
    select: { id: true, slug: true, format: true, createdById: true },
  });
  if (!event) notFound();
  const canManagePasses = isOwnerOrAdmin(event, user);

  let passes;
  let ticketTypes;
  try {
    [passes, ticketTypes] = await Promise.all([listPassesForEvent(event.id, user), listTicketTypesForEvent(event.id, user)]);
  } catch (e) {
    if (e instanceof RegistrationForbiddenError) redirect("/admin/content");
    if (e instanceof RegistrationNotFoundError) notFound();
    throw e;
  }

  const [passRevenue, ticketTypeRevenue, templates, festivalPassEntries] = await Promise.all([
    getEventPassRevenue(event.id, user),
    getEventTicketTypeRevenue(event.id, user),
    listPassTemplatesForUser(user),
    // Attendance по чужому Pass фестиваля (этап 3) — имеет смысл только для
    // событий, которые сами являются дочерним пунктом программы какого-то
    // фестиваля; для остальных всегда 0, показываем KPI только когда > 0,
    // чтобы не путать организатора обычной вечеринки лишней карточкой.
    getEventPassAttendanceCount(event.id, user),
  ]);
  // Промокоды — конфигурация, только владелец/ADMIN (см. pass-service.ts).
  const promoCodes = canManagePasses ? await listPromoCodesForEvent(event.id, user) : [];

  // Доступ к пунктам программы/сессиям — только для форматов, где они вообще
  // существуют (FESTIVAL/MASTERCLASS, см. исследование перед реализацией:
  // PartyDetails не имеет дочерних сущностей).
  let accessOptions: AccessTargetOption[] = [];
  if (event.format === "FESTIVAL") {
    const festival = await prisma.festivalDetails.findUnique({
      where: { eventId: event.id },
      include: { programItems: { orderBy: { order: "asc" } } },
    });
    accessOptions = (festival?.programItems ?? []).map((p) => ({
      id: p.id,
      kind: "programItem" as const,
      label: `${p.title} (${new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(p.startTime)})`,
    }));
  } else if (event.format === "MASTERCLASS") {
    const masterclass = await prisma.masterclassDetails.findUnique({
      where: { eventId: event.id },
      include: { sessions: { orderBy: { order: "asc" } } },
    });
    accessOptions = (masterclass?.sessions ?? []).map((s) => ({
      id: s.id,
      kind: "masterclassSession" as const,
      label: `${s.title} (${new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(s.startTime)})`,
    }));
  }

  const limitedPasses = passes.filter((p) => p.quantity != null);
  const totalPassSold = passes.reduce((sum, p) => sum + p.soldQuantity, 0);
  const totalPassAvailable = limitedPasses.reduce((sum, p) => sum + (p.availableQuantity ?? 0), 0);
  const limitedPassSold = limitedPasses.reduce((sum, p) => sum + p.soldQuantity, 0);
  const limitedPassCapacity = limitedPasses.reduce((sum, p) => sum + (p.quantity ?? 0), 0);
  const passConversionPct = limitedPassCapacity > 0 ? Math.round((limitedPassSold / limitedPassCapacity) * 100) : null;

  const limitedTicketTypes = ticketTypes.filter((t) => t.quantity != null);
  const totalTicketSold = ticketTypes.reduce((sum, t) => sum + t.soldQuantity, 0);
  const totalTicketAvailable = limitedTicketTypes.reduce((sum, t) => sum + (t.availableQuantity ?? 0), 0);

  const passRows = passes.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    type: p.type,
    price: p.price == null ? null : Number(p.price),
    currency: p.currency,
    quantity: p.quantity,
    salesStartAt: p.salesStartAt ? p.salesStartAt.toISOString() : null,
    salesEndAt: p.salesEndAt ? p.salesEndAt.toISOString() : null,
    validFrom: p.validFrom ? p.validFrom.toISOString() : null,
    validUntil: p.validUntil ? p.validUntil.toISOString() : null,
    imageUrl: p.imageUrl,
    allowMultipleEntry: p.allowMultipleEntry,
    status: p.status,
    soldQuantity: p.soldQuantity,
    availableQuantity: p.availableQuantity,
  }));

  const ticketTypeRows = ticketTypes.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    price: t.price == null ? null : Number(t.price),
    currency: t.currency,
    quantity: t.quantity,
    salesStartAt: t.salesStartAt ? t.salesStartAt.toISOString() : null,
    salesEndAt: t.salesEndAt ? t.salesEndAt.toISOString() : null,
    status: t.status,
    soldQuantity: t.soldQuantity,
    availableQuantity: t.availableQuantity,
  }));

  const templateOptions = templates.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    type: t.type,
    price: t.price == null ? null : Number(t.price),
    currency: t.currency,
    quantity: t.quantity,
    imageUrl: t.imageUrl,
    allowMultipleEntry: t.allowMultipleEntry,
  }));

  const registrationsPath = `/admin/content/${event.id}/registrations`;

  return (
    <div className="flex flex-col gap-4">
      {festivalPassEntries > 0 && (
        <p className="m-0 text-sm text-admin-muted">
          Посещений по Pass фестиваля: <strong className="text-night-text">{festivalPassEntries}</strong> — это отдельная статистика
          посещаемости, не связанная с продажами ниже (Pass был куплен на событии фестиваля).
        </p>
      )}

      <TicketsAndPassesTabs
        ticketsCount={ticketTypes.length}
        passesCount={passes.length}
        showPasses={event.format === "FESTIVAL" || passes.length > 0}
        ticketsPanel={
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <StatCard label="Продано" value={totalTicketSold} icon={<PeopleIcon />} tone="primary" />
              <StatCard label="Осталось мест" value={totalTicketAvailable} icon={<AlertIcon />} tone="danger" />
              <StatCard label="Выручка" value={`${ticketTypeRevenue} BYN`} icon={<CardIcon />} tone="success" />
            </div>
            <TicketTypeManager eventSlug={event.slug} registrationsPath={registrationsPath} ticketTypes={ticketTypeRows} />
          </div>
        }
        passesPanel={
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="Продано" value={totalPassSold} icon={<PeopleIcon />} tone="primary" />
              <StatCard label="Осталось мест" value={totalPassAvailable} icon={<AlertIcon />} tone="danger" />
              <StatCard label="Выручка" value={`${passRevenue} BYN`} icon={<CardIcon />} tone="success" />
              <StatCard label="Конверсия продаж" value={passConversionPct == null ? "—" : `${passConversionPct}%`} icon={<TargetIcon />} tone="primary" />
            </div>
            <PassManager
              eventSlug={event.slug}
              registrationsPath={registrationsPath}
              passes={passRows}
              templates={templateOptions}
              accessOptions={accessOptions}
            />
            {canManagePasses && (
              <PromoCodeManager
                eventSlug={event.slug}
                initialCodes={promoCodes.map((c) => ({
                  id: c.id,
                  code: c.code,
                  discountType: c.discountType,
                  discountValue: Number(c.discountValue),
                  usedCount: c.usedCount,
                  maxUses: c.maxUses,
                  isActive: c.isActive,
                }))}
              />
            )}
          </div>
        }
      />
    </div>
  );
}
