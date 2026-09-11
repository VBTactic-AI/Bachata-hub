import { NextRequest, NextResponse } from "next/server";
import { getAudienceVotePublicView } from "@/server/competition/audience-vote";

// Публичный, без RBAC-проверки самого чтения (страница-обёртка требует вход
// для голосования, но опрос состояния сам по себе не приватнее, чем большое
// табло/публичная карточка соревнования — тираж голосов и так отдаётся
// только после PUBLISHED, см. getAudienceVotePublicView).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const view = await getAudienceVotePublicView(id);
  if (!view) {
    return NextResponse.json({ error: "Голосование для этой категории не найдено." }, { status: 404 });
  }
  return NextResponse.json(view);
}
