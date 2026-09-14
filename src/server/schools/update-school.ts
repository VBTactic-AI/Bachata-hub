import { z } from "zod";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export class SchoolForbiddenError extends Error {}
export class SchoolNotFoundError extends Error {}

// Первая в проекте реализация редактирования карточки школы владельцем
// (docs/00_DECISIONS.md, 2026-09-14, /admin/school) — раньше карточку School
// мог менять только ADMIN напрямую в БД; сама School создаётся/привязывается
// сервисом src/server/access-requests/review.ts при одобрении заявки
// SCHOOL_HEAD, а этот сервис — первое место, где владелец правит её сам.
export const updateSchoolProfileSchema = z.object({
  description: z.string().max(2000).optional().nullable(),
  directions: z.array(z.string().min(1).max(40)).max(20),
  levels: z.array(z.enum(["BEGINNER", "ALL_LEVELS", "ADVANCED"])),
  contactPhone: z.string().max(40).optional().nullable(),
  contactEmail: z.string().email().optional().nullable().or(z.literal("")),
  website: z.string().max(300).optional().nullable(),
  instagram: z.string().max(300).optional().nullable(),
});
export type UpdateSchoolProfileInput = z.infer<typeof updateSchoolProfileSchema>;

export async function updateSchoolProfile(user: User, schoolId: string, input: UpdateSchoolProfileInput) {
  const parsed = updateSchoolProfileSchema.parse(input);

  const school = await prisma.school.findUnique({ where: { id: schoolId } });
  if (!school) throw new SchoolNotFoundError();
  if (school.ownerUserId !== user.id) throw new SchoolForbiddenError();

  const existingLinks = (school.socialLinks as { website?: string | null; instagram?: string | null } | null) ?? {};

  return prisma.school.update({
    where: { id: schoolId },
    data: {
      description: parsed.description || null,
      directions: parsed.directions,
      levels: parsed.levels,
      contactPhone: parsed.contactPhone || null,
      contactEmail: parsed.contactEmail || null,
      socialLinks: { ...existingLinks, website: parsed.website || null, instagram: parsed.instagram || null },
    },
  });
}
