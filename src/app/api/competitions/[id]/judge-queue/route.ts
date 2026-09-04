import { NextRequest, NextResponse } from "next/server";
import { getJudgeQueue } from "@/server/judging/scoring";
import { respondToDomainError } from "@/server/http";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const items = await getJudgeQueue(id);
    return NextResponse.json({ items });
  } catch (e) {
    return respondToDomainError(e);
  }
}
