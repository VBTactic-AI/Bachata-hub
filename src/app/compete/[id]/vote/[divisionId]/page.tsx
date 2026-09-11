import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getAudienceVotePublicView } from "@/server/competition/audience-vote";
import { AudienceVoteBoard } from "@/components/compete/AudienceVoteBoard";

// Голосование "приз зрительских симпатий" — доступно только авторизованным
// (прямое требование пользователя, docs/00_DECISIONS.md, план "Приз
// зрительских симпатий"): гость сразу уходит на /login и возвращается сюда же.
export default async function AudienceVotePage({ params }: { params: Promise<{ id: string; divisionId: string }> }) {
  const { id, divisionId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/compete/${id}/vote/${divisionId}`);

  const view = await getAudienceVotePublicView(divisionId);
  if (!view) {
    return (
      <div className="stack gap-3 py-10 text-center">
        <p className="m-0 text-night-muted">Голосование для этой категории не найдено.</p>
      </div>
    );
  }

  return <AudienceVoteBoard competitionId={id} divisionId={divisionId} initial={view} />;
}
