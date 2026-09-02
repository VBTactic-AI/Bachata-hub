import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getDancerProfile } from "@/lib/dancer";
import { DancerProfileView } from "@/components/DancerProfileView";

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
  const dancer = await getDancerProfile(id);
  if (!dancer) notFound();

  return <DancerProfileView dancer={dancer} />;
}
