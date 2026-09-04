import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { suggestedRoleForGender } from "@/server/competition/register-competitor";
import { RegistrationWizard } from "@/components/compete/RegistrationWizard";

export const metadata = { title: "Регистрация" };

const DATE_FMT = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "long", year: "numeric" });

// Регистрация требует сессии — неавторизованного отправляем на /login и
// возвращаем сюда же после входа (см. правку src/app/login/page.tsx).
export default async function CompetitionRegisterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/compete/${id}/register`);

  const competition = await prisma.competition.findUnique({
    where: { id },
    include: {
      city: { select: { nameRu: true } },
      divisions: { include: { category: { select: { name: true } } }, orderBy: { category: { order: "asc" } } },
    },
  });
  if (!competition || competition.status === "DRAFT") notFound();
  if (competition.status !== "REGISTRATION_OPEN") redirect(`/compete/${id}`);

  const dancer = await prisma.dancer.findUnique({
    where: { userId: user.id },
    include: { city: { select: { nameRu: true } } },
  });

  const myDivisionIds = dancer
    ? new Set(
        (await prisma.registration.findMany({ where: { competitionId: id, dancerId: dancer.id }, select: { divisionId: true } })).map(
          (r) => r.divisionId
        )
      )
    : new Set<string>();

  const divisions = competition.divisions
    .filter((d) => !myDivisionIds.has(d.id))
    .map((d) => ({ id: d.id, categoryName: d.category.name }));

  const place = [competition.city?.nameRu, competition.venue].filter(Boolean).join(", ");

  return (
    <div className="stack gap-4">
      <Link href={`/compete/${id}`} className="inline-flex items-center gap-1 text-sm text-night-muted no-underline hover:text-night-text">
        ← Назад
      </Link>
      <h1 className="m-0 font-display text-xl font-extrabold uppercase text-night-text">Регистрация</h1>
      <RegistrationWizard
        competitionId={id}
        competitionName={competition.name}
        dateLabel={competition.startAt ? DATE_FMT.format(competition.startAt) : null}
        placeLabel={place || null}
        divisions={divisions}
        profileName={dancer?.displayName ?? null}
        cityName={dancer?.city?.nameRu ?? null}
        suggestedRole={suggestedRoleForGender(dancer?.gender ?? null)}
      />
    </div>
  );
}
