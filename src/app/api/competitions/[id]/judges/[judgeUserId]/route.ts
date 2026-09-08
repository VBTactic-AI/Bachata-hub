import { NextRequest, NextResponse } from "next/server";
import { removeCompetitionJudge } from "@/server/judging/judge-assignment";
import { respondToDomainError } from "@/server/http";

// Удаление судьи из общего ростера соревнования ("Общий список судей") —
// снимает все его назначения по категориям разом (см. removeCompetitionJudge).
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; judgeUserId: string }> }) {
  const { id, judgeUserId } = await params;
  try {
    await removeCompetitionJudge(id, judgeUserId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respondToDomainError(e);
  }
}
