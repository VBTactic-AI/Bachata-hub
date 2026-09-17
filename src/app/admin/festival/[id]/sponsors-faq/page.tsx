import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listFestivalSponsors } from "@/server/events/festival-sponsor-service";
import { listFestivalFaqItems } from "@/server/events/festival-faq-service";
import { RegistrationForbiddenError, RegistrationNotFoundError } from "@/server/events/registration-service";
import { FestivalSponsorManager } from "@/components/admin/festival/FestivalSponsorManager";
import { FestivalFaqManager } from "@/components/admin/festival/FestivalFaqManager";

// Вкладка «Спонсоры и FAQ» — Stage UI-3 (продолжение переноса UI, Stage 2
// сервисного слоя уже готов). Два независимых CRUD-раздела на одной
// странице — та же логика группировки, что и в исходном UI-макете (соседние
// вкладки одной природы: организатор сам ведёт контент, не гости).
export default async function FestivalSponsorsFaqPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  let sponsors, faqItems;
  try {
    [sponsors, faqItems] = await Promise.all([listFestivalSponsors(id, user), listFestivalFaqItems(id, user)]);
  } catch (e) {
    if (e instanceof RegistrationForbiddenError) redirect("/admin/festival");
    if (e instanceof RegistrationNotFoundError) notFound();
    throw e;
  }

  return (
    <div className="flex flex-col gap-4">
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

      <FestivalFaqManager festivalId={id} items={faqItems.map((f) => ({ id: f.id, question: f.question, answer: f.answer }))} />
    </div>
  );
}
