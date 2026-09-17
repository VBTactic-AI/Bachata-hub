import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { moderateFestivalReview, FestivalReviewValidationError } from "@/server/events/festival-review-service";
import { RegistrationForbiddenError, RegistrationNotFoundError } from "@/server/events/registration-service";

// Тот же payload-контракт, что и у сайтовой модерации отзывов школ
// (/api/moderation/reviews/[id]) — action: "approve"|"reject", не
// произвольный moderationStatus от клиента.
const patchSchema = z.object({ action: z.enum(["approve", "reject"]) });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; reviewId: string }> }) {
  const { reviewId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });

  try {
    const review = await moderateFestivalReview(reviewId, user, parsed.data.action === "approve" ? "APPROVED" : "REJECTED");
    return NextResponse.json({ ok: true, review });
  } catch (e) {
    if (e instanceof RegistrationForbiddenError) return NextResponse.json({ error: e.code }, { status: 403 });
    if (e instanceof RegistrationNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (e instanceof FestivalReviewValidationError) return NextResponse.json({ error: e.code, message: e.message }, { status: 400 });
    throw e;
  }
}
