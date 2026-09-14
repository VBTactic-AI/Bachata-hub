import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { reviewAccessRequest } from "@/server/access-requests/review";
import { revokeAccessRequest } from "@/server/access-requests/revoke";
import {
  AccessRequestAlreadyReviewedError,
  AccessRequestForbiddenError,
  AccessRequestNotFoundError,
} from "@/server/access-requests/errors";

const schema = z.object({
  action: z.enum(["approve", "reject", "needs_info", "revoke"]),
  reason: z.string().optional(),
  // Только для action:"approve" на заявке SCHOOL_HEAD — привязать к уже
  // существующей community-карточке школы вместо создания новой (см.
  // src/server/access-requests/review.ts).
  linkToSchoolId: z.string().optional(),
});

// Единая точка модерации всех 4 типов AccessRequest (заменяет
// api/moderation/claims/[id], который работал только со SchoolClaim —
// модель удалена, см. docs/00_DECISIONS.md 2026-09-14). "revoke" — отдельный
// сервис (revokeAccessRequest), применим только к уже APPROVED заявке.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const { id } = await params;

  try {
    if (parsed.data.action === "revoke") {
      if (!parsed.data.reason) return NextResponse.json({ error: "reason_required" }, { status: 400 });
      const request = await revokeAccessRequest({ reviewer: user, requestId: id, reason: parsed.data.reason });
      return NextResponse.json({ ok: true, request });
    }

    const request = await reviewAccessRequest({
      reviewer: user,
      requestId: id,
      action: parsed.data.action,
      comment: parsed.data.reason,
      linkToSchoolId: parsed.data.linkToSchoolId,
    });
    return NextResponse.json({ ok: true, request });
  } catch (err) {
    if (err instanceof AccessRequestNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (err instanceof AccessRequestAlreadyReviewedError) {
      return NextResponse.json({ error: "already_reviewed" }, { status: 409 });
    }
    if (err instanceof AccessRequestForbiddenError) return NextResponse.json({ error: err.code }, { status: 403 });
    throw err;
  }
}
