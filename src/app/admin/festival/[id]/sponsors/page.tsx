import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listFestivalSponsors } from "@/server/events/festival-sponsor-service";
import { RegistrationForbiddenError, RegistrationNotFoundError } from "@/server/events/registration-service";
import { FestivalSponsorManager } from "@/components/admin/festival/FestivalSponsorManager";

// Вкладка «Спонсоры» — разделена с FAQ на отдельные вкладки (Stage F,
// 2026-09-20, по прямому запросу пользователя, по образцу UI-прототипа,
// где это два самостоятельных панеля, не один общий).
export default async function FestivalSponsorsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  let sponsors;
  try {
    sponsors = await listFestivalSponsors(id, user);
  } catch (e) {
    if (e instanceof RegistrationForbiddenError) redirect("/admin/festival");
    if (e instanceof RegistrationNotFoundError) notFound();
    throw e;
  }

  return (
    <FestivalSponsorManager
      festivalId={id}
      sponsors={sponsors.map((s) => ({
        id: s.id,
        name: s.name,
        tier: s.tier,
        logoUrl: s.logoUrl,
        websiteUrl: s.websiteUrl,
        amount: s.amount == null ? null : Number(s.amount),
        currency: s.currency,
      }))}
    />
  );
}
