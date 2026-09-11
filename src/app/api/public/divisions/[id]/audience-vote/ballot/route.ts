import { NextRequest, NextResponse } from "next/server";
import { castAudienceVoteBallot } from "@/server/competition/audience-vote";
import { castAudienceVoteBallotSchema } from "@/server/competition/schemas";
import { respondToDomainError } from "@/server/http";

// Требует сессию (проверяется внутри castAudienceVoteBallot через
// getCurrentUser) — но не RBAC/CompetitionMember: голосовать может любой
// авторизованный посетитель сайта, не только участники движка соревнований.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = castAudienceVoteBallotSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    await castAudienceVoteBallot(id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respondToDomainError(e);
  }
}
