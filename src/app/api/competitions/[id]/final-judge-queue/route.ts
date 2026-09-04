import { NextRequest, NextResponse } from "next/server";
import { getFinalJudgeQueue } from "@/server/judging/final-scoring";
import { respondToDomainError } from "@/server/http";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const roundId = req.nextUrl.searchParams.get("roundId");
  if (!roundId) {
    return NextResponse.json({ error: "invalid_input", details: "roundId обязателен" }, { status: 400 });
  }
  try {
    const queue = await getFinalJudgeQueue(id, roundId);
    return NextResponse.json({ queue });
  } catch (e) {
    return respondToDomainError(e);
  }
}
