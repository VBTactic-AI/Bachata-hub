import type { PassTemplate, PassType, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { RegistrationForbiddenError, RegistrationNotFoundError } from "./registration-service";
import { requireOwnerOrAdminPass } from "./pass-service";

// PassTemplate (2026-09-16) — "полностью заведённый Pass, сохранённый как
// шаблон", см. комментарий у модели в schema.prisma. Владелец —
// createdById (сам User) + ADMIN — тот же bypass, что и isOwnerOrAdmin
// использует для Event, только без самого Event (шаблон ни к какому
// событию не привязан).

export class PassTemplateValidationError extends Error {
  constructor(
    public code: string,
    message?: string
  ) {
    super(message ?? code);
  }
}

function canManageTemplate(template: { createdById: string }, user: User): boolean {
  return template.createdById === user.id || user.role === "ADMIN";
}

export type PassTemplateInput = {
  name: string;
  description?: string | null;
  type: PassType;
  price?: number | null;
  currency?: string | null;
  quantity?: number | null;
  imageUrl?: string | null;
  allowMultipleEntry?: boolean;
};

function validateTemplateInput(input: Partial<PassTemplateInput>): void {
  if (input.name !== undefined && !input.name.trim()) {
    throw new PassTemplateValidationError("name_required", "Название шаблона обязательно.");
  }
  if (input.price != null && input.price < 0) {
    throw new PassTemplateValidationError("invalid_price", "Цена не может быть отрицательной.");
  }
  if (input.quantity != null && (!Number.isInteger(input.quantity) || input.quantity <= 0)) {
    throw new PassTemplateValidationError("invalid_quantity", "Количество мест должно быть положительным целым числом.");
  }
}

export async function createPassTemplate(user: User, input: PassTemplateInput): Promise<PassTemplate> {
  validateTemplateInput(input);
  return prisma.passTemplate.create({
    data: {
      createdById: user.id,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      type: input.type,
      price: input.price ?? null,
      currency: input.currency?.trim() || null,
      quantity: input.quantity ?? null,
      imageUrl: input.imageUrl?.trim() || null,
      allowMultipleEntry: input.allowMultipleEntry ?? true,
    },
  });
}

// "Сохранить как шаблон" — копирует содержательные поля уже настроенного
// Pass (не даты, не quantity-динамику, см. комментарий у модели). Тот же
// owner-check, что и на редактирование самого Pass.
export async function createPassTemplateFromPass(passId: string, user: User, name?: string): Promise<PassTemplate> {
  const pass = await requireOwnerOrAdminPass(passId, user);
  return prisma.passTemplate.create({
    data: {
      createdById: user.id,
      name: (name?.trim() || pass.name).trim(),
      description: pass.description,
      type: pass.type,
      price: pass.price,
      currency: pass.currency,
      quantity: pass.quantity,
      imageUrl: pass.imageUrl,
      allowMultipleEntry: pass.allowMultipleEntry,
    },
  });
}

export async function listPassTemplatesForUser(user: User): Promise<PassTemplate[]> {
  return prisma.passTemplate.findMany({
    where: user.role === "ADMIN" ? {} : { createdById: user.id },
    orderBy: { createdAt: "desc" },
  });
}

export async function updatePassTemplate(templateId: string, user: User, patch: Partial<PassTemplateInput>): Promise<PassTemplate> {
  const template = await prisma.passTemplate.findUnique({ where: { id: templateId } });
  if (!template) throw new RegistrationNotFoundError();
  if (!canManageTemplate(template, user)) throw new RegistrationForbiddenError("forbidden");
  validateTemplateInput(patch);

  return prisma.passTemplate.update({
    where: { id: templateId },
    data: {
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.description !== undefined ? { description: patch.description?.trim() || null } : {}),
      ...(patch.type !== undefined ? { type: patch.type } : {}),
      ...(patch.price !== undefined ? { price: patch.price } : {}),
      ...(patch.currency !== undefined ? { currency: patch.currency?.trim() || null } : {}),
      ...(patch.quantity !== undefined ? { quantity: patch.quantity } : {}),
      ...(patch.imageUrl !== undefined ? { imageUrl: patch.imageUrl?.trim() || null } : {}),
      ...(patch.allowMultipleEntry !== undefined ? { allowMultipleEntry: patch.allowMultipleEntry } : {}),
    },
  });
}

// Чистая конфигурация без исторического значения (в отличие от Pass/Ticket)
// — физическое удаление, не архивация (CLAUDE.md §18 не применим: тут нечего
// хранить как историю продаж).
export async function deletePassTemplate(templateId: string, user: User): Promise<void> {
  const template = await prisma.passTemplate.findUnique({ where: { id: templateId } });
  if (!template) throw new RegistrationNotFoundError();
  if (!canManageTemplate(template, user)) throw new RegistrationForbiddenError("forbidden");
  await prisma.passTemplate.delete({ where: { id: templateId } });
}
