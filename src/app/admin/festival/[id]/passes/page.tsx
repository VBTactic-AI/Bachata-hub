import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listPassesForEvent, listPromoCodesForEvent } from "@/server/events/pass-service";
import { listPassTemplatesForUser } from "@/server/events/pass-template-service";
import { getEventPassRevenue } from "@/server/events/ticket-service";
import { listReferralCodesForFestival } from "@/server/events/festival-referral-code-service";
import { RegistrationForbiddenError, RegistrationNotFoundError } from "@/server/events/registration-service";
import { isOwnerOrAdminFestival } from "@/server/events/access";
import { StatCard } from "@/components/admin/StatCard";
import { PeopleIcon, CardIcon, AlertIcon, TargetIcon } from "@/components/admin/icons";
import { PassManager } from "@/components/admin/events/PassManager";
import { PromoCodeManager } from "@/components/admin/events/PromoCodeManager";
import type { AccessTargetOption } from "@/components/admin/events/PassFormModal";
import { FestivalFirstPassForm } from "@/components/admin/festival/FestivalFirstPassForm";
import { FestivalReferralCodeManager, type ReferralOwnerOption } from "@/components/admin/festival/FestivalReferralCodeManager";

// Вкладка «Пассы» консоли фестиваля (перенос UI, docs/PROGRESS.md — Festival
// Engine UI transfer, продолжение Stage UI-1). Ключевая архитектурная
// находка (см. docs/PROGRESS.md, Stage UI-2): как только у фестиваля есть
// bridge-Event, эта вкладка переиспользует уже готовые PassManager/
// PromoCodeManager, указывая им bridge-Event.slug — RBAC совпадает 1-в-1 с
// isOwnerOrAdminFestival (bridgeEvent.createdById = festival.createdById,
// см. createFestivalPass), а организатор в UI фестиваля всё равно никогда
// не выбирает "какое событие" — это уже скрыто пропом eventSlug. Своё здесь
// только: бутстрап-форма первого Pass (пока bridge не существует) и
// реферальные коды (которых у обычного события нет вообще).
export default async function FestivalPassesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const festival = await prisma.festival.findUnique({
    where: { id },
    include: { event: true, programItems: { orderBy: { order: "asc" } } },
  });
  if (!festival) notFound();
  if (!isOwnerOrAdminFestival(festival, user)) redirect("/admin/festival");

  if (!festival.eventId || !festival.event) {
    return <FestivalFirstPassForm festivalId={festival.id} />;
  }

  const bridgeEvent = festival.event;

  let passes;
  try {
    passes = await listPassesForEvent(bridgeEvent.id, user);
  } catch (e) {
    if (e instanceof RegistrationForbiddenError) redirect("/admin/festival");
    if (e instanceof RegistrationNotFoundError) notFound();
    throw e;
  }

  const [passRevenue, templates, promoCodes, referralCodes, teachers, schools] = await Promise.all([
    getEventPassRevenue(bridgeEvent.id, user),
    listPassTemplatesForUser(user),
    listPromoCodesForEvent(bridgeEvent.id, user),
    listReferralCodesForFestival(festival.id, user),
    prisma.teacher.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.school.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const teacherNameById = new Map(teachers.map((t) => [t.id, t.name]));
  const schoolNameById = new Map(schools.map((s) => [s.id, s.name]));

  const accessOptions: AccessTargetOption[] = festival.programItems.map((p) => ({
    id: p.id,
    kind: "programItem" as const,
    label: `${p.title} (${new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(p.startTime)})`,
  }));

  const limitedPasses = passes.filter((p) => p.quantity != null);
  const totalPassSold = passes.reduce((sum, p) => sum + p.soldQuantity, 0);
  const totalPassAvailable = limitedPasses.reduce((sum, p) => sum + (p.availableQuantity ?? 0), 0);
  const limitedPassSold = limitedPasses.reduce((sum, p) => sum + p.soldQuantity, 0);
  const limitedPassCapacity = limitedPasses.reduce((sum, p) => sum + (p.quantity ?? 0), 0);
  const passConversionPct = limitedPassCapacity > 0 ? Math.round((limitedPassSold / limitedPassCapacity) * 100) : null;

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
    refundPolicy: p.refundPolicy,
    refundDeadline: p.refundDeadline ? p.refundDeadline.toISOString() : null,
    refundFeePercent: p.refundFeePercent == null ? null : Number(p.refundFeePercent),
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

  const teacherOptions: ReferralOwnerOption[] = teachers.map((t) => ({ id: t.id, label: t.name }));
  const schoolOptions: ReferralOwnerOption[] = schools.map((s) => ({ id: s.id, label: s.name }));
  const referralCodeRows = referralCodes.map((c) => ({
    id: c.id,
    code: c.code,
    ownerLabel: c.ownerTeacherId
      ? (teacherNameById.get(c.ownerTeacherId) ?? "—")
      : (schoolNameById.get(c.ownerSchoolId!) ?? "—"),
    discountType: c.discountType,
    discountValue: c.discountValue == null ? null : Number(c.discountValue),
    commissionType: c.commissionType,
    commissionValue: Number(c.commissionValue),
    active: c.active,
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Продано" value={totalPassSold} icon={<PeopleIcon />} tone="primary" />
        <StatCard label="Осталось мест" value={totalPassAvailable} icon={<AlertIcon />} tone="danger" />
        <StatCard label="Выручка" value={`${passRevenue} BYN`} icon={<CardIcon />} tone="success" />
        <StatCard label="Конверсия продаж" value={passConversionPct == null ? "—" : `${passConversionPct}%`} icon={<TargetIcon />} tone="primary" />
      </div>

      <PassManager
        eventSlug={bridgeEvent.slug}
        registrationsPath={`/admin/content/${bridgeEvent.id}/registrations`}
        passes={passRows}
        templates={templateOptions}
        accessOptions={accessOptions}
      />

      <PromoCodeManager
        eventSlug={bridgeEvent.slug}
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

      <FestivalReferralCodeManager
        festivalId={festival.id}
        initialCodes={referralCodeRows}
        teachers={teacherOptions}
        schools={schoolOptions}
      />
    </div>
  );
}
