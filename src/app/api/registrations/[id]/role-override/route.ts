import { NextRequest, NextResponse } from "next/server";
import { reviewRoleOverride } from "@/server/competition/review-role-override";
import { reviewRoleOverrideSchema } from "@/server/competition/registration-schemas";
import { respondToDomainError } from "@/server/http";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = reviewRoleOverrideSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const registration = await reviewRoleOverride(id, parsed.data.decision, { reason: parsed.data.reason });
    return NextResponse.json({ ok: true, registration });
  } catch (e) {
    return respondToDomainError(e);
  }
}
