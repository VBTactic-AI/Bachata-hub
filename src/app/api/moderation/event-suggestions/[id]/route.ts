import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { reviewEventSuggestion } from "@/server/event-suggestions/review";
import {
  EventSuggestionAlreadyReviewedError,
  EventSuggestionForbiddenError,
  EventSuggestionNotFoundError,
} from "@/server/event-suggestions/errors";

const schema = z.object({ action: z.enum(["approve", "reject"]), reason: z.string().optional() });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const { id } = await params;
  try {
    const suggestion = await reviewEventSuggestion({
      reviewer: user,
      suggestionId: id,
      action: parsed.data.action,
      reason: parsed.data.reason,
    });
    return NextResponse.json({ ok: true, suggestion });
  } catch (err) {
    if (err instanceof EventSuggestionNotFoundError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (err instanceof EventSuggestionForbiddenError) return NextResponse.json({ error: err.code }, { status: 403 });
    if (err instanceof EventSuggestionAlreadyReviewedError) return NextResponse.json({ error: "already_reviewed" }, { status: 409 });
    throw err;
  }
}
