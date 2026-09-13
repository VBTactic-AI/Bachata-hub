import { prisma } from "@/lib/prisma";
import { getPublicCompetitionView } from "@/server/public/public-competition-view";
import type { CompetitionCardData } from "@/components/compete/CompetitionCard";

// Данные для блока "JNJ Live" на главной — тонкая надстройка над уже
// существующим публичным представлением соревнования
// (getPublicCompetitionView, docs/05_STATUS_REFERENCE.md), а не новый источник
// приватных данных: только то, что уже безопасно показывать зрителю без
// логина на /compete/[id]. Ничего не придумываем — если соревнований в LIVE
// нет, секция сама покажет ближайшее вместо выдуманного "живого" статуса.

export type LiveCompetitionSummary = {
  id: string;
  name: string;
  cityName: string | null;
  currentStageLabel: string | null;
  heatNumber: number | null;
  categoryName: string | null;
  registrationsCount: number;
  leadersCount: number;
  followersCount: number;
  divisionsCount: number;
};

export async function getLiveCompetitionSummary(): Promise<LiveCompetitionSummary | null> {
  const live = await prisma.competition.findFirst({
    where: { status: "LIVE" },
    orderBy: { startAt: "desc" },
    select: { id: true },
  });
  if (!live) return null;

  const view = await getPublicCompetitionView(live.id);
  if (!view) return null;

  return {
    id: view.id,
    name: view.name,
    cityName: view.cityName,
    currentStageLabel: view.liveStatus?.roundLabel ?? null,
    heatNumber: view.liveStatus?.heatNumber ?? null,
    categoryName: view.liveStatus?.divisionCategoryName ?? null,
    registrationsCount: view.stats.registrationsCount,
    leadersCount: view.stats.leadersCount,
    followersCount: view.stats.followersCount,
    divisionsCount: view.stats.divisionsCount,
  };
}

// Пока ни одно соревнование не LIVE, показываем ближайшее с открытой
// регистрацией/явкой — та же карточка (CompetitionCard/CompetitionCardData),
// что и на /compete, чтобы не заводить второй визуальный стиль карточки
// соревнования.
export async function getUpcomingCompetitionTeaser(): Promise<CompetitionCardData | null> {
  const c = await prisma.competition.findFirst({
    where: {
      status: { in: ["REGISTRATION_OPEN", "REGISTRATION_CLOSED", "CHECK_IN", "READY"] },
      OR: [{ startAt: null }, { startAt: { gte: new Date() } }],
    },
    orderBy: { startAt: "asc" },
    include: {
      city: { select: { nameRu: true } },
      event: { select: { photoUrl: true } },
      divisions: { include: { category: { select: { name: true } } }, orderBy: { category: { order: "asc" } } },
      _count: { select: { registrations: { where: { status: "REGISTERED" } } } },
    },
  });
  if (!c) return null;

  return {
    id: c.id,
    name: c.name,
    startAt: c.startAt,
    venue: c.venue,
    cityName: c.city?.nameRu ?? null,
    status: c.status,
    coverUrl: c.event?.photoUrl ?? null,
    isRegistered: false,
    divisionNames: c.divisions.map((d) => d.category.name),
    registrationsCount: c._count.registrations,
  };
}
