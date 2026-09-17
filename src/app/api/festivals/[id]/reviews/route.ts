import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { submitFestivalReview, listFestivalReviews, FestivalReviewValidationError } from "@/server/events/festival-review-service";
import { RegistrationForbiddenError, RegistrationNotFoundError } from "@/server/events/registration-service";

const createSchema = z.object({
  rating: z.number().int().min(1).max(5),
  text: z.string().min(1).max(2000),
});

// GET — очередь модерации организатора (все отзывы, включая неодобренные).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const reviews = await listFestivalReviews(id, user);
    return NextResponse.json({ reviews });
  } catch (e) {
    if (e instanceof RegistrationForbiddenError) return NextResponse.json({ error: e.code }, { status: 403 });
    if (e instanceof RegistrationNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    throw e;
  }
}

// POST — оставить отзыв. Требует логин (как и отзывы школ — Review.authorId
// обязателен), НЕ требует hasFestivalAccess — это действие гостя, не
// организатора.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });

  try {
    const review = await submitFestivalReview(id, user, parsed.data);
    return NextResponse.json({ ok: true, review });
  } catch (e) {
    if (e instanceof RegistrationNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (e instanceof FestivalReviewValidationError) return NextResponse.json({ error: e.code, message: e.message }, { status: 400 });
    throw e;
  }
}
