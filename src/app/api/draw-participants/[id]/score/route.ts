import { NextRequest, NextResponse } from "next/server";
import { submitJudgeScore } from "@/server/judging/scoring";
import { submitJudgeScoreSchema } from "@/server/competition/schemas";
import { respondToDomainError } from "@/server/http";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = submitJudgeScoreSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    await submitJudgeScore(id, parsed.data.value);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respondToDomainError(e);
  }
}
