import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getDancerProfile } from "@/lib/dancer";
import { DancerProfileView } from "@/components/DancerProfileView";
import { getAudienceAwardsForDancer } from "@/server/statistics/audience-vote-statistics";
import { getActor } from "@/server/rbac/actor";
import { can } from "@/server/rbac/authorize";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const dancer = await getDancerProfile(id);
  if (!dancer) return {};
  return { title: dancer.displayName };
}

export default async function PublicDancerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [dancer, actor] = await Promise.all([getDancerProfile(id), getActor()]);
  if (!dancer) notFound();

  // Приз зрительских симпатий на публичном профиле — самому танцору и
  // SUPER_ADMIN виден всегда; остальным посетителям — только если танцор сам
  // включил showAudienceAwardsPublicly (docs/00_DECISIONS.md, план "Приз
  // зрительских симпатий"). can(actor, "statistics:view") без competitionId
  // проходит только по глобальным правам — фактически только SUPER_ADMIN.
  const isSelf = actor?.userId === dancer.userId;
  const canSeeAudienceAwards = isSelf || can(actor, "statistics:view") || dancer.showAudienceAwardsPublicly;
  const audienceAwards = canSeeAudienceAwards ? await getAudienceAwardsForDancer(dancer.id) : undefined;

  return <DancerProfileView dancer={dancer} audienceAwards={audienceAwards} />;
}
