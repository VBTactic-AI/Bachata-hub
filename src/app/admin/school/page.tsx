import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { t } from "@/lib/i18n/dictionary";
import { StatCard } from "@/components/admin/StatCard";
import { VerificationBadge } from "@/components/VerificationBadge";
import { SchoolProfileForm } from "@/components/admin/school/SchoolProfileForm";

// CRM своей школы — первая версия (docs/00_DECISIONS.md, 2026-09-14):
// базовая статистика + редактирование карточки. Branches/Teachers/Schedule
// показаны только для чтения — полноценный CRUD для них не входит в объём
// этого захода, отдельная следующая задача.
export default async function SchoolAdminPage() {
  const user = await getCurrentUser();
  if (!user) return null; // layout уже отредиректил бы раньше

  const school = await prisma.school.findFirst({
    where: { ownerUserId: user.id },
    include: {
      city: true,
      branches: { include: { city: true } },
      teachers: true,
      schedules: { include: { teacher: true }, orderBy: { weekday: "asc" } },
      _count: { select: { reviews: true, events: true } },
    },
  });
  if (!school) return null; // layout уже отредиректил бы раньше

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="m-0 font-night text-xl font-extrabold text-night-text sm:text-2xl">{school.name}</h1>
        <VerificationBadge status={school.verificationStatus} />
      </div>
      <p className="m-0 -mt-3 text-sm text-admin-muted">{school.city.nameRu}</p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Преподавателей" value={school.teachers.length} />
        <StatCard label="Филиалов" value={school.branches.length} />
        <StatCard label="Отзывов" value={school._count.reviews} />
        <StatCard label="Событий" value={school._count.events} />
      </div>

      <div className="rounded-app border border-admin-border bg-admin-card p-4">
        <h2 className="m-0 mb-3 font-night text-base font-bold text-night-text">Карточка школы</h2>
        <SchoolProfileForm
          schoolSlug={school.slug}
          initial={{
            description: school.description,
            directions: school.directions,
            levels: school.levels,
            contactPhone: school.contactPhone,
            contactEmail: school.contactEmail,
            website: (school.socialLinks as { website?: string } | null)?.website ?? null,
            instagram: (school.socialLinks as { instagram?: string } | null)?.instagram ?? null,
          }}
        />
      </div>

      <div className="rounded-app border border-admin-border bg-admin-card p-4">
        <h2 className="m-0 mb-3 font-night text-base font-bold text-night-text">Преподаватели</h2>
        {school.teachers.length === 0 ? (
          <p className="m-0 text-sm text-admin-muted">Пока нет преподавателей.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-sm text-night-text">
            {school.teachers.map((tch) => (
              <li key={tch.id} className="flex items-center justify-between border-b border-admin-border py-1.5 last:border-0">
                <span>{tch.name}</span>
                {!tch.isActive && <span className="text-xs text-admin-disabled">скрыт</span>}
              </li>
            ))}
          </ul>
        )}
        <p className="m-0 mt-3 text-xs text-admin-disabled">Редактирование преподавателей/расписания — следующий этап.</p>
      </div>

      <div className="rounded-app border border-admin-border bg-admin-card p-4">
        <h2 className="m-0 mb-3 font-night text-base font-bold text-night-text">Расписание</h2>
        {school.schedules.length === 0 ? (
          <p className="m-0 text-sm text-admin-muted">Пока нет расписания.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-sm text-night-text">
            {school.schedules.map((s) => (
              <li key={s.id} className="border-b border-admin-border py-1.5 last:border-0">
                {t.school.weekdays[s.weekday] ?? s.weekday} · {s.startTime}–{s.endTime} · {s.teacher?.name ?? "—"}
                {s.hall ? ` · ${s.hall}` : ""}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
