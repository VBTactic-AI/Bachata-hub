import { prisma } from "@/lib/prisma";
import type { AccessRequestStatus, AccessRequestType } from "@prisma/client";

export async function getMyAccessRequests(userId: string) {
  return prisma.accessRequest.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
}

export async function listAccessRequestsByType(
  type: AccessRequestType,
  statuses: AccessRequestStatus[] = ["PENDING", "NEEDS_INFO"]
) {
  return prisma.accessRequest.findMany({
    where: { type, status: { in: statuses } },
    include: { user: true, city: true, country: true },
    orderBy: { createdAt: "asc" },
  });
}
