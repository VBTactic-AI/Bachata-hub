import { NextRequest, NextResponse } from "next/server";
import { searchJudgeCandidatesByName } from "@/server/judging/search-judges";
import { respondToDomainError } from "@/server/http";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const q = req.nextUrl.searchParams.get("q") ?? "";

  try {
    const results = await searchJudgeCandidatesByName(id, q);
    return NextResponse.json({ ok: true, results });
  } catch (e) {
    return respondToDomainError(e);
  }
}
