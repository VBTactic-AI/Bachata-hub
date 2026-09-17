import { z } from "zod";
import type { SchoolBranch, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SchoolForbiddenError, SchoolNotFoundError } from "./update-school";

// CRUD филиалов школы (адрес + необязательные координаты) — владелец
// (School.ownerUserId) редактирует их в /admin/school. Координаты
// необязательны: пока не заданы, публичная страница показывает адрес
// текстом без карты (см. src/app/schools/[slug]/page.tsx) — фронтенд не
// подставляет и не выдумывает их сам.
export class SchoolBranchValidationError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const coordSchema = z.number().finite();

export const schoolBranchInputSchema = z.object({
  address: z.string().trim().min(1).max(300),
  cityId: z.string().min(1).optional().nullable(),
  latitude: coordSchema.min(-90).max(90).optional().nullable(),
  longitude: coordSchema.min(-180).max(180).optional().nullable(),
});
export type SchoolBranchInput = z.infer<typeof schoolBranchInputSchema>;

function validateCoordPair(input: { latitude?: number | null; longitude?: number | null }): void {
  const hasLat = input.latitude !== undefined && input.latitude !== null;
  const hasLng = input.longitude !== undefined && input.longitude !== null;
  if (hasLat !== hasLng) {
    throw new SchoolBranchValidationError("coordinates_incomplete", "Укажите и широту, и долготу, либо оставьте оба поля пустыми.");
  }
}

async function requireOwner(schoolId: string, user: User) {
  const school = await prisma.school.findUnique({ where: { id: schoolId } });
  if (!school) throw new SchoolNotFoundError();
  if (school.ownerUserId !== user.id) throw new SchoolForbiddenError();
  return school;
}

async function requireAccessForBranch(branchId: string, user: User) {
  const branch = await prisma.schoolBranch.findUnique({ where: { id: branchId }, include: { school: true } });
  if (!branch) throw new SchoolNotFoundError();
  if (branch.school.ownerUserId !== user.id) throw new SchoolForbiddenError();
  return branch;
}

export async function createSchoolBranch(schoolId: string, user: User, input: SchoolBranchInput): Promise<SchoolBranch> {
  await requireOwner(schoolId, user);
  validateCoordPair(input);

  return prisma.schoolBranch.create({
    data: {
      schoolId,
      address: input.address.trim(),
      cityId: input.cityId || null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
    },
  });
}

export async function updateSchoolBranch(branchId: string, user: User, patch: Partial<SchoolBranchInput>): Promise<SchoolBranch> {
  const existing = await requireAccessForBranch(branchId, user);
  validateCoordPair({
    latitude: patch.latitude !== undefined ? patch.latitude : existing.latitude,
    longitude: patch.longitude !== undefined ? patch.longitude : existing.longitude,
  });

  return prisma.schoolBranch.update({
    where: { id: branchId },
    data: {
      ...(patch.address !== undefined ? { address: patch.address.trim() } : {}),
      ...(patch.cityId !== undefined ? { cityId: patch.cityId || null } : {}),
      ...(patch.latitude !== undefined ? { latitude: patch.latitude } : {}),
      ...(patch.longitude !== undefined ? { longitude: patch.longitude } : {}),
    },
  });
}

export async function deleteSchoolBranch(branchId: string, user: User): Promise<void> {
  await requireAccessForBranch(branchId, user);
  await prisma.schoolBranch.delete({ where: { id: branchId } });
}
