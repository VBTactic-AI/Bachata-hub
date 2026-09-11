import { NextRequest, NextResponse } from "next/server";
import { configureAudienceVote, getAudienceVoteAdminView } from "@/server/competition/audience-vote";
import { configureAudienceVoteSchema } from "@/server/competition/schemas";
import { respondToDomainError } from "@/server/http";

// Админский live-вид голосования этой категории (числа видны организатору
// всегда, независимо от статуса — план "Приз зрительских симпатий").
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const view = await getAudienceVoteAdminView(id);
    return NextResponse.json({ view });
  } catch (e) {
    return respondToDomainError(e);
  }
}

// Настроить (или создать при первом вызове) голосование — только пока IDLE.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = configureAudienceVoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    await configureAudienceVote(id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respondToDomainError(e);
  }
}
