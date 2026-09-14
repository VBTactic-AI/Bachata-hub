import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/auth";
import { logModeration } from "@/lib/moderation";
import type { SchoolHeadPayload } from "./schemas";
import { AccessRequestForbiddenError, AccessRequestNotFoundError } from "./errors";

// Access Request Engine — отзыв уже выданного доступа ("на всякий случай",
// по прямому запросу пользователя). Уже созданные данные (события/
// соревнования/школа) НЕ удаляются — отзывается только сам доступ, история
// остаётся (CLAUDE.md §18/§51).
export async function revokeAccessRequest(params: { reviewer: User; requestId: string; reason: string }) {
  if (!isAdmin(params.reviewer)) throw new AccessRequestForbiddenError("forbidden");

  const request = await prisma.accessRequest.findUnique({ where: { id: params.requestId } });
  if (!request) throw new AccessRequestNotFoundError();
  if (request.status !== "APPROVED") throw new AccessRequestForbiddenError("not_approved");

  await prisma.$transaction(async (tx) => {
    await tx.accessRequest.update({
      where: { id: request.id },
      data: { status: "REVOKED", reviewedById: params.reviewer.id, reviewedAt: new Date(), reviewComment: params.reason },
    });

    switch (request.type) {
      case "EVENT_ORGANIZER":
        await tx.user.update({ where: { id: request.userId }, data: { isVerifiedEventOrganizer: false } });
        break;
      case "FESTIVAL_ORGANIZER":
        await tx.user.update({ where: { id: request.userId }, data: { isVerifiedFestivalOrganizer: false } });
        break;
      case "SCHOOL_HEAD": {
        const payload = request.payload as unknown as SchoolHeadPayload;
        if (payload.resolvedSchoolId) {
          await tx.school.update({
            where: { id: payload.resolvedSchoolId },
            data: { ownerUserId: null, verificationStatus: "COMMUNITY" },
          });
        }
        break;
      }
      case "COMPETITION_ORGANIZER": {
        const role = await tx.role.findUnique({ where: { code: "COMPETITION_ORGANIZER" } });
        if (role) {
          await tx.userRoleAssignment.deleteMany({ where: { userId: request.userId, roleId: role.id } });
        }
        break;
      }
    }
  });

  await logModeration(params.reviewer, "ACCESS_REQUEST", request.id, "revoke", params.reason);
  return request;
}
