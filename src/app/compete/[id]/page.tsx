import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { InfoCard } from "@/components/compete/InfoCard";

const DATE_FMT = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "long", year: "numeric" });

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const competition = await prisma.competition.findUnique({ where: { id }, select: { name: true } });
  return { title: competition?.name ?? "Соревнование" };
}

// Публичная карточка одного соревнования (по референсу пользователя,
// 2026-09-04). DRAFT скрыт от посторонних (CLAUDE.md §42) — но не от тех,
// кто уже в нём участвует (organizerи/судьи заходят через /admin, обычному
// танцору тут просто нечего делать до анонса).
export default async function CompetitionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();

  const [competition, dancer] = await Promise.all([
    prisma.competition.findUnique({
      where: { id },
      include: {
        city: { select: { nameRu: true } },
        event: { select: { photoUrl: true } },
        divisions: { include: { category: { select: { name: true } } }, orderBy: { category: { order: "asc" } } },
      },
    }),
    user ? prisma.dancer.findUnique({ where: { userId: user.id }, select: { id: true } }) : null,
  ]);

  if (!competition || competition.status === "DRAFT") notFound();

  const myRegistration = dancer
    ? await prisma.registration.findFirst({ where: { competitionId: id, dancerId: dancer.id } })
    : null;

  const categoryNames = [...new Set(competition.divisions.map((d) => d.category.name))];
  const place = [competition.city?.nameRu, competition.venue].filter(Boolean).join(", ");
  const isOpen = competition.status === "REGISTRATION_OPEN";

  return (
    <div className="stack gap-4 pb-4">
      <Link href="/compete" className="inline-flex items-center gap-1 text-sm text-night-muted no-underline hover:text-night-text">
        ← Назад
      </Link>

      <div
        className="relative flex min-h-[180px] flex-col justify-end overflow-hidden rounded-app bg-gradient-night-hero bg-cover bg-center p-5"
        style={competition.event?.photoUrl ? { backgroundImage: `url(${competition.event.photoUrl})` } : undefined}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
        <div className="relative">
          <h1 className="m-0 font-display text-2xl font-extrabold uppercase tracking-tight text-white">{competition.name}</h1>
          {(competition.startAt || place) && (
            <p className="m-0 mt-1 text-sm font-medium text-white/85">
              {competition.startAt ? DATE_FMT.format(competition.startAt).toUpperCase() : ""}
              {competition.startAt && place ? " · " : ""}
              {place}
            </p>
          )}
        </div>
      </div>

      {!user ? (
        <Link
          href={`/login?next=/compete/${id}`}
          className="block rounded-full bg-gradient-night-cta py-3.5 text-center text-sm font-bold uppercase tracking-wide text-white no-underline"
        >
          Войти, чтобы зарегистрироваться
        </Link>
      ) : myRegistration ? (
        <div className="rounded-full border border-night-success/40 bg-night-success/10 py-3.5 text-center text-sm font-bold text-night-success">
          ✓ Вы зарегистрированы
        </div>
      ) : isOpen ? (
        <Link
          href={`/compete/${id}/register`}
          className="block rounded-full bg-gradient-night-cta py-3.5 text-center text-sm font-bold uppercase tracking-wide text-white no-underline shadow-[0_8px_24px_-8px_rgba(124,58,237,0.6)]"
        >
          Зарегистрироваться
        </Link>
      ) : (
        <div className="rounded-full bg-night-card2 py-3.5 text-center text-sm font-bold text-night-disabled">Регистрация закрыта</div>
      )}

      {competition.description && (
        <div>
          <h2 className="m-0 mb-2 font-display text-base font-bold text-night-text">О событии</h2>
          <p className="m-0 whitespace-pre-line text-sm leading-relaxed text-night-muted">{competition.description}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2.5">
        {competition.startAt && <InfoCard icon="📅" label="Дата" value={DATE_FMT.format(competition.startAt)} />}
        {place && <InfoCard icon="📍" label="Место" value={place} />}
        {categoryNames.length > 0 && <InfoCard icon="🏆" label="Категории" value={categoryNames.join(", ")} />}
        {competition.organizerName && <InfoCard icon="👤" label="Организатор" value={competition.organizerName} />}
      </div>
    </div>
  );
}
