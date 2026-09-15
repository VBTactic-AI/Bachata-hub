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
  // pendingClaims — имя поля сохранено (не переименовано в pendingSchoolAccessRequests)
  // ради минимального диффа в потребителях (admin/page.tsx, admin/moderation/page.tsx,
  // AdminSidebar.tsx) — источник данных сменился со SchoolClaim на
  // AccessRequest(type: SCHOOL_HEAD), сам смысл счётчика не изменился.
  const [pendingEvents, pendingClaims, newReviews, pendingOrganizerRequests, pendingEventSuggestions] = await Promise.all([
    prisma.event.count({ where: { moderationStatus: "PENDING" } }),
    prisma.accessRequest.count({ where: { type: "SCHOOL_HEAD", status: { in: ["PENDING", "NEEDS_INFO"] } } }),
    prisma.review.count({ where: { moderatedById: null } }),
    prisma.accessRequest.count({
      where: { type: { in: ["EVENT_ORGANIZER", "FESTIVAL_ORGANIZER", "COMPETITION_ORGANIZER"] }, status: { in: ["PENDING", "NEEDS_INFO"] } },
    }),
    prisma.eventSuggestion.count({ where: { status: "PENDING" } }),
  ]);
  return { pendingEvents, pendingClaims, newReviews, pendingOrganizerRequests, pendingEventSuggestions };
}
