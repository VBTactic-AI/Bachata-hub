import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { moderateGuestQuestion } from "@/server/events/festival-guest-question-service";
import { RegistrationForbiddenError, RegistrationNotFoundError } from "@/server/events/registration-service";

const patchSchema = z.object({ action: z.enum(["approve", "reject"]) });

// PATCH — модерация (видимость на публичной странице), НЕ ответ. Тот же
// payload-контракт, что и у модерации отзывов (action: approve|reject).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { itemId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });

  try {
    const item = await moderateGuestQuestion(itemId, user, parsed.data.action === "approve" ? "APPROVED" : "REJECTED");
    return NextResponse.json({ ok: true, item });
  } catch (e) {
    if (e instanceof RegistrationForbiddenError) return NextResponse.json({ error: e.code }, { status: 403 });
    if (e instanceof RegistrationNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    throw e;
  }
}
