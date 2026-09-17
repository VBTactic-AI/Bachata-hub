import type { FestivalSponsor, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireFestivalAccess } from "./festival-service";
import { hasFestivalAccess } from "./access";
import { EventsValidationError, RegistrationForbiddenError, RegistrationNotFoundError } from "./registration-service";

// Festival Engine — Stage 2 (2026-09-17, docs/FESTIVAL_SERVICE_LAYER_PLAN.md).
// Спонсоры/партнёры фестиваля — привязаны напрямую к Festival, не к
// bridge-Event (маркетинговый блок публичной страницы, не билетная
// инфраструктура). RBAC — тот же hasFestivalAccess, что и у Festival/ProgramItem.

export class FestivalSponsorValidationError extends EventsValidationError {}

export type FestivalSponsorInput = {
  name: string;
  tier: string;
  logoUrl?: string | null;
  websiteUrl?: string | null;
  // Сумма денежного взноса — попадает в «Доход» вкладки «Бюджет» (решение
  // пользователя, docs/FESTIVAL_SERVICE_LAYER_PLAN.md §2.2). Nullable —
  // спонсор может быть бартерным/информационным, без денег вообще.
  amount?: number | null;
  currency?: string | null;
  sortOrder?: number;
};

function validate(input: Partial<FestivalSponsorInput>): void {
  if (input.name !== undefined && !input.name.trim()) {
    throw new FestivalSponsorValidationError("name_required", "Название спонсора обязательно.");
  }
  if (input.tier !== undefined && !input.tier.trim()) {
    throw new FestivalSponsorValidationError("tier_required", "Уровень спонсора обязателен.");
  }
  if (input.amount != null && input.amount < 0) {
    throw new FestivalSponsorValidationError("invalid_amount", "Сумма взноса не может быть отрицательной.");
  }
}

export async function createFestivalSponsor(festivalId: string, user: User, input: FestivalSponsorInput): Promise<FestivalSponsor> {
  await requireFestivalAccess(festivalId, user);
  validate(input);

  return prisma.festivalSponsor.create({
    data: {
      festivalId,
      name: input.name.trim(),
      tier: input.tier.trim(),
      logoUrl: input.logoUrl?.trim() || null,
      websiteUrl: input.websiteUrl?.trim() || null,
      amount: input.amount ?? null,
      currency: input.currency?.trim() || null,
      sortOrder: input.sortOrder ?? 0,
    },
  });
}

async function requireAccessForSponsor(sponsorId: string, user: User) {
  const sponsor = await prisma.festivalSponsor.findUnique({ where: { id: sponsorId }, include: { festival: true } });
  if (!sponsor) throw new RegistrationNotFoundError();
  if (!(await hasFestivalAccess(sponsor.festival, user))) throw new RegistrationForbiddenError("forbidden");
  return sponsor;
}

export async function updateFestivalSponsor(
  sponsorId: string,
  user: User,
  patch: Partial<FestivalSponsorInput>
): Promise<FestivalSponsor> {
  await requireAccessForSponsor(sponsorId, user);
  validate(patch);

  return prisma.festivalSponsor.update({
    where: { id: sponsorId },
    data: {
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.tier !== undefined ? { tier: patch.tier.trim() } : {}),
      ...(patch.logoUrl !== undefined ? { logoUrl: patch.logoUrl?.trim() || null } : {}),
      ...(patch.websiteUrl !== undefined ? { websiteUrl: patch.websiteUrl?.trim() || null } : {}),
      ...(patch.amount !== undefined ? { amount: patch.amount } : {}),
      ...(patch.currency !== undefined ? { currency: patch.currency?.trim() || null } : {}),
      ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
    },
  });
}

export async function deleteFestivalSponsor(sponsorId: string, user: User): Promise<void> {
  await requireAccessForSponsor(sponsorId, user);
  await prisma.festivalSponsor.delete({ where: { id: sponsorId } });
}

export async function listFestivalSponsors(festivalId: string, user: User): Promise<FestivalSponsor[]> {
  await requireFestivalAccess(festivalId, user);
  return prisma.festivalSponsor.findMany({ where: { festivalId }, orderBy: { sortOrder: "asc" } });
}
