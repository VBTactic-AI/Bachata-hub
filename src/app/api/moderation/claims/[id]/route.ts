import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isModerator } from "@/lib/auth";
import { logModeration } from "@/lib/moderation";

const schema = z.object({
  action: z.enum(["approve", "reject"]),
  reason: z.string().optional(),
});

// Одобрение заявки — единственное место в системе, где School.ownerUserId и
// verificationStatus меняются автоматически, и происходит это только после
// осознанного решения модератора (см. ТЗ: ручная проверка обязательна).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !isModerator(user)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const { id } = await params;
  const claim = await prisma.schoolClaim.findUnique({ where: { id } });
  if (!claim) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const status = parsed.data.action === "approve" ? "APPROVED" : "REJECTED";

  await prisma.$transaction(async (tx) => {
    await tx.schoolClaim.update({
      where: { id },
      data: {
        status,
        reviewedById: user.id,
        reviewedAt: new Date(),
        reviewComment: parsed.data.reason,
      },
    });

    if (status === "APPROVED") {
      await tx.school.update({
        where: { id: claim.schoolId },
        data: { verificationStatus: "VERIFIED", ownerUserId: claim.claimantId },
      });
      // на всякий случай отменяем другие висящие заявки на ту же школу
      await tx.schoolClaim.updateMany({
        where: { schoolId: claim.schoolId, status: "PENDING", id: { not: id } },
        data: { status: "REJECTED", reviewedById: user.id, reviewedAt: new Date() },
      });
    }
  });

  await logModeration(user, "SCHOOL_CLAIM", claim.id, parsed.data.action, parsed.data.reason);

  return NextResponse.json({ ok: true });
}
