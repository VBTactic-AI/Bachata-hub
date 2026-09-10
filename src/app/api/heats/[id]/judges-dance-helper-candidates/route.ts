import { NextRequest, NextResponse } from "next/server";
import { listJudgesDanceHelperCandidates } from "@/server/judging/final-judges-dance";
import { respondToDomainError } from "@/server/http";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const candidates = await listJudgesDanceHelperCandidates(id);
    return NextResponse.json({ ok: true, ...candidates });
  } catch (e) {
    return respondToDomainError(e);
  }
}
