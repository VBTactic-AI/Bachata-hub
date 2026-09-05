import { Suspense } from "react";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { FilterTabs } from "@/components/compete/FilterTabs";
import { CompetitionCard, type CompetitionCardData } from "@/components/compete/CompetitionCard";
import { EmptyState } from "@/components/compete/EmptyState";

export const metadata = { title: "Соревнования" };

// Публичный список конкурсов Jack & Jill (по референсу пользователя,
// 2026-09-04) — отдельно от /admin/competitions (тот список — рабочий
// инструмент организатора/судьи, этот — витрина для танцора). DRAFT
// намеренно не попадает сюда: соревнование, которое ещё не объявлено,
// не публичные данные (CLAUDE.md §42). Один запрос на весь список + один
// на "мои регистрации" — без N+1 на карточку.
export default async function CompeteListPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = "all" } = await searchParams;
  const user = await getCurrentUser();
  const dancer = user ? await prisma.dancer.findUnique({ where: { userId: user.id }, select: { id: true } }) : null;

  const myRegistrations = dancer
    ? await prisma.registration.findMany({ where: { dancerId: dancer.id }, select: { competitionId: true } })
    : [];
  const myCompetitionIds = new Set(myRegistrations.map((r) => r.competitionId));

  const competitions = await prisma.competition.findMany({
    where:
      tab === "mine"
        ? { id: { in: [...myCompetitionIds] } }
        : { status: { not: "DRAFT" } },
    include: { city: { select: { nameRu: true } }, event: { select: { photoUrl: true } } },
    orderBy: tab === "soon" ? { startAt: "asc" } : { startAt: "desc" },
  });

  const visible = tab === "soon" ? competitions.filter((c) => !c.startAt || c.startAt >= new Date()) : competitions;

  const cards: CompetitionCardData[] = visible.map((c) => ({
    id: c.id,
    name: c.name,
    startAt: c.startAt,
    venue: c.venue,
    cityName: c.city?.nameRu ?? null,
    status: c.status,
    coverUrl: c.event?.photoUrl ?? null,
    isRegistered: myCompetitionIds.has(c.id),
  }));

  return (
    <div className="stack gap-4">
      <h1 className="font-night text-xl font-extrabold text-night-text">Соревнования</h1>
      <Suspense fallback={null}>
        <FilterTabs />
      </Suspense>
      {cards.length === 0 ? (
        <EmptyState
          title={tab === "mine" ? "Вы пока никуда не зарегистрированы" : "Соревнований пока нет"}
          hint={tab === "mine" ? "Загляните на вкладку «Все», чтобы найти открытую регистрацию." : undefined}
        />
      ) : (
        <div className="stack gap-2.5">
          {cards.map((c) => (
            <CompetitionCard key={c.id} competition={c} />
          ))}
        </div>
      )}
    </div>
  );
}
