import { NextRequest, NextResponse } from "next/server";
import { stopAudienceVote } from "@/server/competition/audience-vote";
import { respondToDomainError } from "@/server/http";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await stopAudienceVote(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respondToDomainError(e);
  }
}
