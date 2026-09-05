import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getDancerByUserId } from "@/lib/dancer";
import { prisma } from "@/lib/prisma";
import { t } from "@/lib/i18n/dictionary";
import Link from "next/link";
import { DancerProfileView } from "@/components/DancerProfileView";
import { ProfileEditForm } from "@/components/ProfileEditForm";
import { AchievementForm } from "@/components/AchievementForm";
import { CompetitorStatisticsCard } from "@/components/CompetitorStatisticsCard";
import { getCompetitorStatistics } from "@/server/statistics/competitor-statistics";
import { isNoShow } from "@/server/competition/no-show";
import { Card } from "@/components/ui/card";
import {
  COMPETITION_STATUS_LABELS,
  REGISTRATION_ROLE_LABELS,
  REGISTRATION_STATUS_LABELS,
} from "@/lib/competition-labels";

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [dancer, cities] = await Promise.all([
    getDancerByUserId(user.id),
    prisma.city.findMany({ where: { isActive: true }, orderBy: { nameRu: "asc" } }),
  ]);

  // У служебных аккаунтов (админ/модератор/школа) профиля танцора может не
  // быть — это не ошибка (см. seed.ts), но молча кидать на главную без
  // объяснения — плохой UX. Профиль появится сам собой, как только аккаунт
  // зарегистрируется на конкурс слоя 3 (docs/00_DECISIONS.md, D9) — ничего
  // переключать вручную не нужно.
  if (!dancer) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="m-0 font-night text-xl font-extrabold text-night-text">{t.dancer.publicProfileOf}</h1>
        <p className="text-sm text-night-muted">{t.dancer.noProfileForThisAccount}</p>
      </div>
    );
  }

  // Достижение имеет смысл привязывать к событию, на котором танцор
  // отмечал "был" — предлагаем такие события в форме добавления.
  const attendedEvents = dancer.attendances
    .filter((a) => a.status === "WENT")
    .map((a) => a.event);

  // "Мои соревнования" (слой 3) — данные были готовы с этапа 3, здесь
  // впервые выводятся в интерфейсе участника, а не только организатора.
  const [registrations, statistics] = await Promise.all([
    prisma.registration.findMany({
      where: { dancerId: dancer.id },
      include: {
        competition: { select: { id: true, name: true, status: true } },
        division: { include: { category: true } },
        checkIn: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    getCompetitorStatistics(dancer.id),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-end gap-2">
        <ProfileEditForm dancer={dancer} cities={cities} />
      </div>
      <DancerProfileView dancer={dancer} editable />

      <CompetitorStatisticsCard statistics={statistics} />

      <div>
        <h2 className="m-0 mb-2 font-night text-base font-bold text-night-text">Мои соревнования</h2>
        {registrations.length === 0 ? (
          <p className="text-sm text-night-muted">Вы пока не зарегистрированы ни на одно соревнование.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {registrations.map((r) => {
              const noShow = isNoShow({
                registrationStatus: r.status,
                hasCheckIn: r.checkIn !== null,
                competitionStatus: r.competition.status,
              });
              return (
                <Link key={r.id} href={`/admin/competitions/${r.competition.id}`} className="block no-underline">
                  <Card interactive className="border-night-border bg-night-card hover:border-night-primary/60">
                    <strong className="text-night-text">{r.competition.name}</strong>
                    <p className="mt-1 text-sm text-night-muted">
                      {r.division.category.name} · {REGISTRATION_ROLE_LABELS[r.role] ?? r.role} ·{" "}
                      {REGISTRATION_STATUS_LABELS[r.status] ?? r.status}
                      {r.checkIn && ` · номер ${r.checkIn.bibNumber}`}
                      {noShow && " · не явился"}
                    </p>
                    <p className="mt-1 text-sm text-night-muted">
                      {COMPETITION_STATUS_LABELS[r.competition.status] ?? r.competition.status}
                      {r.roleOverrideStatus === "PENDING" && " · роль ждёт подтверждения организатора"}
                    </p>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <AchievementForm attendedEvents={attendedEvents} />
      </div>
      <p className="text-sm text-night-muted">
        {t.auth.email}: {user.email}
      </p>
    </div>
  );
}
