import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listPassesForEvent } from "@/server/events/pass-service";
import { getEventPassRevenue } from "@/server/events/ticket-service";
import { listPassTemplatesForUser } from "@/server/events/pass-template-service";
import { listPromoCodesForEvent } from "@/server/events/pass-service";
import { RegistrationForbiddenError, RegistrationNotFoundError } from "@/server/events/registration-service";
import { StatCard } from "@/components/admin/StatCard";
import { PeopleIcon, CardIcon, TargetIcon, AlertIcon } from "@/components/admin/icons";
import { PassManager } from "@/components/admin/events/PassManager";
import { PromoCodeManager } from "@/components/admin/events/PromoCodeManager";
import type { AccessTargetOption } from "@/components/admin/events/PassFormModal";
import { isOwnerOrAdmin } from "@/server/events/access";

// Ticket Engine — вкладка "Билеты" Event Dashboard (2026-09-16). Owner-check
// делает listPassesForEvent (hasEventAccess — любой член команды видит Pass,
// чтобы выдавать билеты, см. комментарий там); создание/редактирование сам
// PassManager делает через API-роуты, которые уже проверяют isOwnerOrAdmin.
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
  try {
    passes = await listPassesForEvent(event.id, user);
  } catch (e) {
    if (e instanceof RegistrationForbiddenError) redirect("/admin/content");
    if (e instanceof RegistrationNotFoundError) notFound();
    throw e;
  }

  const revenue = await getEventPassRevenue(event.id, user);
  const templates = await listPassTemplatesForUser(user);
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

  const limited = passes.filter((p) => p.quantity != null);
  const totalSold = passes.reduce((sum, p) => sum + p.soldQuantity, 0);
  const totalAvailable = limited.reduce((sum, p) => sum + (p.availableQuantity ?? 0), 0);
  const limitedSold = limited.reduce((sum, p) => sum + p.soldQuantity, 0);
  const limitedCapacity = limited.reduce((sum, p) => sum + (p.quantity ?? 0), 0);
  const conversionPct = limitedCapacity > 0 ? Math.round((limitedSold / limitedCapacity) * 100) : null;

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

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Продано" value={totalSold} icon={<PeopleIcon />} tone="primary" />
        <StatCard label="Осталось мест" value={totalAvailable} icon={<AlertIcon />} tone="danger" />
        <StatCard label="Выручка" value={`${revenue} BYN`} icon={<CardIcon />} tone="success" />
        <StatCard label="Конверсия продаж" value={conversionPct == null ? "—" : `${conversionPct}%`} icon={<TargetIcon />} tone="primary" />
      </div>

      <PassManager
        eventSlug={event.slug}
        registrationsPath={`/admin/content/${event.id}/registrations`}
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
  );
}
