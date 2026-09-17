import type { FestivalReferralCode, PromoDiscountType, ReferralCommissionType, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireFestivalAccess } from "./festival-service";
import { hasFestivalAccess } from "./access";
import { EventsValidationError, RegistrationForbiddenError, RegistrationNotFoundError } from "./registration-service";

// Festival Engine — Stage 4 (2026-09-17, docs/FESTIVAL_SERVICE_LAYER_PLAN.md).
// Реферальный код артиста/школы — ОТДЕЛЬНАЯ модель от PromoCode (решение
// пользователя, docs/FESTIVAL_UI_TO_DB_PLAN.md §2.4): в первую очередь
// атрибуция продаж конкретному владельцу, скидка покупателю опциональна.
// CRUD-поверхность сознательно зеркалит уже существующий PromoCode
// (createPromoCode/listPromoCodesForEvent/setPromoCodeActive в
// pass-service.ts) — НЕТ отдельного "update" произвольных полей и НЕТ
// физического удаления: код может уже быть привязан к Ticket
// (referralCodeId), удаление истории продаж запрещено (CLAUDE.md §18).
// Деактивация (active=false) — единственный способ "выключить" код.

export class FestivalReferralCodeValidationError extends EventsValidationError {}

// Ровно один владелец — Teacher ИЛИ School (CHECK в БД, migration.sql,
// такой же принцип, что и у PassAccessGrant/Review) — здесь дублируется на
// уровне TS-типа и валидации, чтобы не ловить голый Postgres-error.
export type ReferralCodeOwner = { ownerTeacherId: string; ownerSchoolId?: undefined } | { ownerSchoolId: string; ownerTeacherId?: undefined };

export type FestivalReferralCodeInput = {
  code: string;
  owner: ReferralCodeOwner;
  discountType?: PromoDiscountType | null;
  discountValue?: number | null;
  commissionType: ReferralCommissionType;
  commissionValue: number;
  active?: boolean;
  startsAt?: Date | null;
  expiresAt?: Date | null;
};

function validateOwner(owner: ReferralCodeOwner): void {
  const hasTeacher = !!owner.ownerTeacherId;
  const hasSchool = !!owner.ownerSchoolId;
  if (hasTeacher === hasSchool) {
    throw new FestivalReferralCodeValidationError(
      "owner_required",
      "Реферальный код должен принадлежать ровно одному владельцу — артисту или школе."
    );
  }
}

function validate(input: { code: string; owner: ReferralCodeOwner; discountType?: PromoDiscountType | null; discountValue?: number | null; commissionType: ReferralCommissionType; commissionValue: number; startsAt?: Date | null; expiresAt?: Date | null }): void {
  if (!input.code.trim()) {
    throw new FestivalReferralCodeValidationError("code_required", "Код обязателен.");
  }
  validateOwner(input.owner);

  const hasDiscountType = input.discountType != null;
  const hasDiscountValue = input.discountValue != null;
  if (hasDiscountType !== hasDiscountValue) {
    throw new FestivalReferralCodeValidationError(
      "invalid_discount_pair",
      "Тип скидки и размер скидки должны быть заданы вместе, либо не заданы вовсе."
    );
  }
  if (hasDiscountValue && input.discountValue! <= 0) {
    throw new FestivalReferralCodeValidationError("invalid_discount_value", "Размер скидки должен быть положительным.");
  }
  if (input.discountType === "PERCENT" && hasDiscountValue && input.discountValue! > 100) {
    throw new FestivalReferralCodeValidationError("invalid_discount_percent", "Скидка в процентах не может быть больше 100.");
  }

  if (input.commissionValue <= 0) {
    throw new FestivalReferralCodeValidationError("invalid_commission_value", "Размер комиссии должен быть положительным.");
  }
  if (input.commissionType === "PERCENT" && input.commissionValue > 100) {
    throw new FestivalReferralCodeValidationError("invalid_commission_percent", "Комиссия в процентах не может быть больше 100.");
  }
  if (input.startsAt && input.expiresAt && input.startsAt > input.expiresAt) {
    throw new FestivalReferralCodeValidationError("invalid_window", "Начало действия кода не может быть позже окончания.");
  }
}

export async function createReferralCode(festivalId: string, user: User, input: FestivalReferralCodeInput): Promise<FestivalReferralCode> {
  await requireFestivalAccess(festivalId, user);
  validate(input);

  try {
    return await prisma.festivalReferralCode.create({
      data: {
        festivalId,
        code: input.code.trim().toUpperCase(),
        ownerTeacherId: input.owner.ownerTeacherId ?? null,
        ownerSchoolId: input.owner.ownerSchoolId ?? null,
        discountType: input.discountType ?? null,
        discountValue: input.discountValue ?? null,
        commissionType: input.commissionType,
        commissionValue: input.commissionValue,
        active: input.active ?? true,
        startsAt: input.startsAt ?? null,
        expiresAt: input.expiresAt ?? null,
      },
    });
  } catch (err) {
    if ((err as { code?: string })?.code === "P2002") {
      throw new FestivalReferralCodeValidationError("duplicate_referral_code", "Такой код уже используется в этом фестивале.");
    }
    throw err;
  }
}

async function requireAccessForCode(codeId: string, user: User) {
  const code = await prisma.festivalReferralCode.findUnique({ where: { id: codeId }, include: { festival: true } });
  if (!code) throw new RegistrationNotFoundError();
  if (!(await hasFestivalAccess(code.festival, user))) throw new RegistrationForbiddenError("forbidden");
  return code;
}

export async function setReferralCodeActive(codeId: string, user: User, active: boolean): Promise<FestivalReferralCode> {
  await requireAccessForCode(codeId, user);
  return prisma.festivalReferralCode.update({ where: { id: codeId }, data: { active } });
}

export async function listReferralCodesForFestival(festivalId: string, user: User): Promise<FestivalReferralCode[]> {
  await requireFestivalAccess(festivalId, user);
  return prisma.festivalReferralCode.findMany({ where: { festivalId }, orderBy: { createdAt: "desc" } });
}

export type ReferralCodeStats = {
  ticketCount: number;
  totalDiscountAmount: number;
  totalCommissionAmount: number;
};

// Агрегат атрибуции — только реально оплаченные действующие билеты (тот же
// фильтр status="ISSUED"/isPaid=true, что и у getEventPassRevenue в
// ticket-service.ts), не считаем отменённые/возвращённые продажи.
export async function getReferralCodeStats(codeId: string, user: User): Promise<ReferralCodeStats> {
  await requireAccessForCode(codeId, user);

  const agg = await prisma.ticket.aggregate({
    where: { referralCodeId: codeId, status: "ISSUED", isPaid: true },
    _count: { _all: true },
    _sum: { referralDiscountAmount: true, referralCommissionAmount: true },
  });

  return {
    ticketCount: agg._count._all,
    totalDiscountAmount: Number(agg._sum.referralDiscountAmount ?? 0),
    totalCommissionAmount: Number(agg._sum.referralCommissionAmount ?? 0),
  };
}

// Действителен ли код ПРЯМО СЕЙЧАС — чистая функция без обращения к БД,
// переиспользуется в issueTicket() (ticket-service.ts) внутри транзакции
// выдачи билета, где сам код уже прочитан отдельным запросом (нужен tx-клиент
// транзакции, а не prisma напрямую — см. комментарий там).
export function isReferralCodeCurrentlyActive(
  code: { active: boolean; startsAt: Date | null; expiresAt: Date | null },
  now: Date = new Date()
): boolean {
  if (!code.active) return false;
  if (code.startsAt && code.startsAt > now) return false;
  if (code.expiresAt && code.expiresAt < now) return false;
  return true;
}
