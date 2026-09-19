import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listFestivalFaqItems } from "@/server/events/festival-faq-service";
import { RegistrationForbiddenError, RegistrationNotFoundError } from "@/server/events/registration-service";
import { FestivalFaqManager } from "@/components/admin/festival/FestivalFaqManager";

// Вкладка «FAQ» — разделена со «Спонсоры» на отдельные вкладки (Stage F,
// 2026-09-20, по прямому запросу пользователя, по образцу UI-прототипа).
export default async function FestivalFaqPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  let faqItems;
  try {
    faqItems = await listFestivalFaqItems(id, user);
  } catch (e) {
    if (e instanceof RegistrationForbiddenError) redirect("/admin/festival");
    if (e instanceof RegistrationNotFoundError) notFound();
    throw e;
  }

  return <FestivalFaqManager festivalId={id} items={faqItems.map((f) => ({ id: f.id, question: f.question, answer: f.answer }))} />;
}
