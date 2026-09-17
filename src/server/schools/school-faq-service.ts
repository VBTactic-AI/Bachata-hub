import type { SchoolFaqItem, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SchoolForbiddenError, SchoolNotFoundError } from "./update-school";

// FAQ школы — ведёт владелец (School.ownerUserId), показывается аккордеоном
// на публичной странице /schools/[slug]. По образцу
// src/server/events/festival-faq-service.ts (тот же принцип: вопрос/ответ/
// sortOrder, владелец редактирует, публичное чтение — без RBAC).

export class SchoolFaqItemValidationError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export type SchoolFaqItemInput = {
  question: string;
  answer: string;
  sortOrder?: number;
};

function validate(input: Partial<SchoolFaqItemInput>): void {
  if (input.question !== undefined && !input.question.trim()) {
    throw new SchoolFaqItemValidationError("question_required", "Вопрос обязателен.");
  }
  if (input.answer !== undefined && !input.answer.trim()) {
    throw new SchoolFaqItemValidationError("answer_required", "Ответ обязателен.");
  }
}

async function requireOwner(schoolId: string, user: User) {
  const school = await prisma.school.findUnique({ where: { id: schoolId } });
  if (!school) throw new SchoolNotFoundError();
  if (school.ownerUserId !== user.id) throw new SchoolForbiddenError();
  return school;
}

export async function createSchoolFaqItem(schoolId: string, user: User, input: SchoolFaqItemInput): Promise<SchoolFaqItem> {
  await requireOwner(schoolId, user);
  validate(input);

  return prisma.schoolFaqItem.create({
    data: {
      schoolId,
      question: input.question.trim(),
      answer: input.answer.trim(),
      sortOrder: input.sortOrder ?? 0,
    },
  });
}

async function requireAccessForFaqItem(itemId: string, user: User) {
  const item = await prisma.schoolFaqItem.findUnique({ where: { id: itemId }, include: { school: true } });
  if (!item) throw new SchoolNotFoundError();
  if (item.school.ownerUserId !== user.id) throw new SchoolForbiddenError();
  return item;
}

export async function updateSchoolFaqItem(itemId: string, user: User, patch: Partial<SchoolFaqItemInput>): Promise<SchoolFaqItem> {
  await requireAccessForFaqItem(itemId, user);
  validate(patch);

  return prisma.schoolFaqItem.update({
    where: { id: itemId },
    data: {
      ...(patch.question !== undefined ? { question: patch.question.trim() } : {}),
      ...(patch.answer !== undefined ? { answer: patch.answer.trim() } : {}),
      ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
    },
  });
}

export async function deleteSchoolFaqItem(itemId: string, user: User): Promise<void> {
  await requireAccessForFaqItem(itemId, user);
  await prisma.schoolFaqItem.delete({ where: { id: itemId } });
}

export async function listSchoolFaqItems(schoolId: string, user: User): Promise<SchoolFaqItem[]> {
  await requireOwner(schoolId, user);
  return prisma.schoolFaqItem.findMany({ where: { schoolId }, orderBy: { sortOrder: "asc" } });
}

// Публичная — без RBAC, для /schools/[slug].
export async function listPublicSchoolFaqItems(schoolId: string): Promise<SchoolFaqItem[]> {
  return prisma.schoolFaqItem.findMany({ where: { schoolId }, orderBy: { sortOrder: "asc" } });
}
