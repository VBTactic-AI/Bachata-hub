import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getMyEventSuggestions } from "@/server/event-suggestions/queries";
import { SuggestEventForm } from "@/components/suggest-event/SuggestEventForm";
import { EventSuggestionStatusList } from "@/components/suggest-event/EventSuggestionStatusList";

// §7 ТЗ (Event Suggestions) — публичная точка входа: обычный (не
// верифицированный) пользователь предлагает идею события админу. НЕ путать
// с /become-organizer (AccessRequest) — там заявка на ПРАВО создавать
// события вообще, здесь — про ОДНО конкретное событие, без каких-либо прав
// на выходе.
export default async function SuggestEventPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [cities, mySuggestions] = await Promise.all([
    prisma.city.findMany({ where: { isActive: true }, orderBy: { nameRu: "asc" } }),
    getMyEventSuggestions(user.id),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="m-0 font-night text-xl font-extrabold text-night-text sm:text-2xl">Предложить событие</h1>
        <p className="m-0 mt-1 text-sm text-night-muted">
          Слышали про вечеринку или мастер-класс, которых нет в календаре? Расскажите нам — если всё подтвердится, мы добавим его сами.
        </p>
      </div>

      <SuggestEventForm cities={cities.map((c) => ({ id: c.id, nameRu: c.nameRu }))} />

      {mySuggestions.length > 0 && (
        <div>
          <h2 className="m-0 mb-2 text-sm font-semibold uppercase tracking-wide text-night-muted">Ваши предложения</h2>
          <EventSuggestionStatusList suggestions={mySuggestions} />
        </div>
      )}
    </div>
  );
}
