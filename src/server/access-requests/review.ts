import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/auth";
import { uniqueSlug } from "@/lib/slug";
import { logModeration } from "@/lib/moderation";
import { emitDomainEvent } from "@/server/notifications/emit-domain-event";
import type { SchoolHeadPayload } from "./schemas";
import { AccessRequestAlreadyReviewedError, AccessRequestForbiddenError, AccessRequestNotFoundError } from "./errors";

export type ReviewAction = "approve" | "reject" | "needs_info";

// Access Request Engine — решение супер-админа по заявке. Один сервис на
// approve/reject/needs_info и на все 4 типа доступа (переключатель по
// request.type внутри) — по образцу claims/[id]/route.ts, который заменяет
// (SchoolClaim удалена из схемы, см. docs/00_DECISIONS.md, 2026-09-14).
//
// Что именно выдаётся при одобрении — см. план: EVENT_ORGANIZER/
// FESTIVAL_ORGANIZER — булев флаг на User; SCHOOL_HEAD — School (новая или,
// если админ указал linkToSchoolId, уже существующая community-карточка);
// COMPETITION_ORGANIZER — глобальная роль слоя 3 через UserRoleAssignment
// (createCompetition() дальше сам делает создателя EVENT_ADMIN его
// соревнования — см. src/server/competition/create-competition.ts).
export async function reviewAccessRequest(params: {
  reviewer: User;
  requestId: string;
  action: ReviewAction;
  comment?: string;
  linkToSchoolId?: string;
}) {
  if (!isAdmin(params.reviewer)) throw new AccessRequestForbiddenError("forbidden");

  const request = await prisma.accessRequest.findUnique({ where: { id: params.requestId } });
  if (!request) throw new AccessRequestNotFoundError();
  if (request.status !== "PENDING" && request.status !== "NEEDS_INFO") {
    throw new AccessRequestAlreadyReviewedError();
  }

  const status = params.action === "approve" ? "APPROVED" : params.action === "reject" ? "REJECTED" : "NEEDS_INFO";

  // Слаг школы — до транзакции (тот же приём, что и createCompetition():
  // uniqueSlug ходит через глобальный prisma, не tx, см. src/lib/slug.ts).
  const schoolSlug =
    status === "APPROVED" && request.type === "SCHOOL_HEAD" && !params.linkToSchoolId
      ? await uniqueSlug("school", (request.payload as unknown as SchoolHeadPayload).schoolName)
      : null;

  await prisma.$transaction(async (tx) => {
    await tx.accessRequest.update({
      where: { id: request.id },
      data: { status, reviewedById: params.reviewer.id, reviewedAt: new Date(), reviewComment: params.comment },
    });

    if (status !== "APPROVED") return;

    switch (request.type) {
      case "EVENT_ORGANIZER":
        await tx.user.update({ where: { id: request.userId }, data: { isVerifiedEventOrganizer: true } });
        break;
      case "FESTIVAL_ORGANIZER":
        await tx.user.update({ where: { id: request.userId }, data: { isVerifiedFestivalOrganizer: true } });
        break;
      case "SCHOOL_HEAD": {
        const payload = request.payload as unknown as SchoolHeadPayload;
        let schoolId: string;
        let finalSlug: string;
        if (params.linkToSchoolId) {
          const linked = await tx.school.update({
            where: { id: params.linkToSchoolId },
            data: { ownerUserId: request.userId, verificationStatus: "VERIFIED" },
          });
          schoolId = linked.id;
          finalSlug = linked.slug;
        } else {
          const created = await tx.school.create({
            data: {
              slug: schoolSlug!,
              name: payload.schoolName,
              // cityId обязателен в submitAccessRequestSchema — гарантированно заполнен.
              cityId: request.cityId!,
              description: request.description,
              directions: payload.teachingStyles,
              contactPhone: request.phone,
              socialLinks: { website: payload.website ?? null, instagram: payload.instagram ?? null },
              verificationStatus: "VERIFIED",
              ownerUserId: request.userId,
            },
          });
          schoolId = created.id;
          finalSlug = created.slug;
        }
        // Сохраняем ссылку на реальную школу в payload — нужно для точного
        // revoke() (пользователь может иметь несколько заявок SCHOOL_HEAD).
        await tx.accessRequest.update({
          where: { id: request.id },
          data: { payload: { ...payload, resolvedSchoolId: schoolId } },
        });

        // Тот же DIRECT-эффект, что раньше давал approve SchoolClaim
        // (Notification & Subscription Engine Phase 6) — персональное
        // уведомление заявителю, не рассылка по подписке.
        await emitDomainEvent(tx, {
          type: "SCHOOL_VERIFIED",
          payload: { entityId: schoolId, schoolSlug: finalSlug, schoolName: payload.schoolName, directUserId: request.userId },
          idempotencyKey: `SCHOOL_VERIFIED:${request.id}`,
        });
        break;
      }
      case "COMPETITION_ORGANIZER": {
        const role = await tx.role.findUniqueOrThrow({ where: { code: "COMPETITION_ORGANIZER" } });
        await tx.userRoleAssignment.upsert({
          where: { userId_roleId: { userId: request.userId, roleId: role.id } },
          update: {},
          create: { userId: request.userId, roleId: role.id, grantedById: params.reviewer.id },
        });
        break;
      }
    }
  });

  // Вне транзакции — тот же порядок, что уже применялся в claims/[id]/route.ts
  // (logModeration использует глобальный prisma, не tx).
  await logModeration(params.reviewer, "ACCESS_REQUEST", request.id, params.action, params.comment);

  return request;
}
