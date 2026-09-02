import { prisma } from "./prisma";
import type { ModerationEntity, User } from "@prisma/client";

export async function logModeration(
  actor: User,
  entity: ModerationEntity,
  entityId: string,
  action: string,
  reason?: string | null
) {
  await prisma.moderationLog.create({
    data: { actorId: actor.id, entity, entityId, action, reason: reason || undefined },
  });
}

// Простая метрика роста продукта (см. нефункциональные требования ТЗ):
// это индикаторы того, набирает ли продукт критическую массу, а не трафик.
export async function getGrowthStats() {
  const [activeCities, verifiedSchools, dancersWithHistory] = await Promise.all([
    prisma.city.count({
      where: {
        events: { some: { moderationStatus: "APPROVED", isArchived: false } },
      },
    }),
    prisma.school.count({ where: { verificationStatus: "VERIFIED" } }),
    prisma.dancer.count({ where: { attendances: { some: {} } } }),
  ]);
  return { activeCities, verifiedSchools, dancersWithHistory };
}

export async function getModerationQueueCounts() {
  const [pendingEvents, pendingClaims, newReviews] = await Promise.all([
    prisma.event.count({ where: { moderationStatus: "PENDING" } }),
    prisma.schoolClaim.count({ where: { status: "PENDING" } }),
    prisma.review.count({ where: { moderatedById: null } }),
  ]);
  return { pendingEvents, pendingClaims, newReviews };
}
