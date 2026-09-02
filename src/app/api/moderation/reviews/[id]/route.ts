import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isModerator } from "@/lib/auth";
import { logModeration } from "@/lib/moderation";

const schema = z.object({
  action: z.enum(["approve", "reject"]),
  reason: z.string().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !isModerator(user)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const { id } = await params;
  const review = await prisma.review.update({
    where: { id },
    data: {
      moderationStatus: parsed.data.action === "approve" ? "APPROVED" : "REJECTED",
      moderatedById: user.id,
    },
  });

  await logModeration(user, "REVIEW", review.id, parsed.data.action, parsed.data.reason);

  return NextResponse.json({ ok: true, review });
}
