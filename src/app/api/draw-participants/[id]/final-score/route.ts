import { NextRequest, NextResponse } from "next/server";
import { submitFinalJudgeScore } from "@/server/judging/final-scoring";
import { submitFinalJudgeScoreSchema } from "@/server/competition/schemas";
import { respondToDomainError } from "@/server/http";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = submitFinalJudgeScoreSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    await submitFinalJudgeScore(id, parsed.data.criterionId, parsed.data.value, parsed.data.clientSubmissionId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respondToDomainError(e);
  }
}
