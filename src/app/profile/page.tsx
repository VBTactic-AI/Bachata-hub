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
      <div className="stack">
        <h1 className="page-title">{t.dancer.publicProfileOf}</h1>
        <p className="hint-text">{t.dancer.noProfileForThisAccount}</p>
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
    <div className="stack">
      <div className="flex justify-end gap-2">
        <ProfileEditForm dancer={dancer} cities={cities} />
      </div>
      <DancerProfileView dancer={dancer} editable />

      <CompetitorStatisticsCard statistics={statistics} />

      <div>
        <h2 className="page-title">Мои соревнования</h2>
        {registrations.length === 0 ? (
          <p className="hint-text">Вы пока не зарегистрированы ни на одно соревнование.</p>
        ) : (
          <div className="stack gap-3">
            {registrations.map((r) => (
              <Link key={r.id} href={`/admin/competitions/${r.competition.id}`} className="block no-underline">
                <Card interactive>
                  <strong className="text-ink">{r.competition.name}</strong>
                  <p className="hint-text mt-1">
                    {r.division.category.name} · {REGISTRATION_ROLE_LABELS[r.role] ?? r.role} ·{" "}
                    {REGISTRATION_STATUS_LABELS[r.status] ?? r.status}
                    {r.checkIn && ` · номер ${r.checkIn.bibNumber}`}
                  </p>
                  <p className="hint-text mt-1">
                    {COMPETITION_STATUS_LABELS[r.competition.status] ?? r.competition.status}
                    {r.roleOverrideStatus === "PENDING" && " · роль ждёт подтверждения организатора"}
                  </p>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div>
        <AchievementForm attendedEvents={attendedEvents} />
      </div>
      <p className="hint-text">
        {t.auth.email}: {user.email}
      </p>
    </div>
  );
}
