import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { t } from "@/lib/i18n/dictionary";
import { VerificationBadge } from "@/components/VerificationBadge";
import { ReviewForm } from "@/components/ReviewForm";
import { ClaimSchoolButton } from "@/components/ClaimSchoolButton";
import { Card } from "@/components/ui/card";
import { Tag } from "@/components/ui/tag";

// userId передаётся только когда известен текущий пользователь — тогда в
// выборку дополнительно попадают его СОБСТВЕННЫЕ отзывы в любом статусе
// (PENDING/REJECTED), чтобы автор видел, что он написал и что с этим
// происходит. Всем остальным видны только APPROVED — отзыв никто, кроме
// автора и модераторов, не видит, пока модератор его не одобрит.
async function getSchool(slug: string, userId?: string) {
  return prisma.school.findUnique({
    where: { slug },
    include: {
      city: true,
      branches: { include: { city: true } },
      teachers: { where: { isActive: true } },
      schedules: { include: { teacher: true } },
      reviews: {
        where: userId
          ? { OR: [{ moderationStatus: "APPROVED" }, { authorId: userId }] }
          : { moderationStatus: "APPROVED" },
        include: { author: { include: { dancer: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const school = await getSchool(slug);
  if (!school) return {};
  return {
    title: school.name,
    description:
      school.description?.slice(0, 160) ?? `${t.meta.schoolFallbackDescription} ${school.city.nameRu}`,
  };
}

export default async function SchoolPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  const school = await getSchool(slug, user?.id);
  if (!school || !school.isActive) notFound();

  // Рейтинг и schema.org-разметка считаются только по опубликованным
  // отзывам — собственный ещё не проверенный отзыв не должен влиять на то,
  // что видят поисковики и другие посетители.
  const publicReviews = school.reviews.filter((r) => r.moderationStatus === "APPROVED");
  const avgRating =
    publicReviews.length > 0
      ? publicReviews.reduce((sum, r) => sum + r.rating, 0) / publicReviews.length
      : null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: school.name,
    address: school.branches[0]?.address || school.city.nameRu,
    telephone: school.contactPhone || undefined,
    email: school.contactEmail || undefined,
    aggregateRating: avgRating
      ? {
          "@type": "AggregateRating",
          ratingValue: avgRating.toFixed(1),
          reviewCount: publicReviews.length,
        }
      : undefined,
  };

  const canClaim = user && user.role === "SCHOOL_REP" && school.ownerUserId !== user.id;

  return (
    <div className="flex flex-col gap-5 pb-4">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="flex flex-col items-start gap-2">
        <VerificationBadge status={school.verificationStatus} />
        <h1 className="m-0 font-night text-2xl font-extrabold tracking-tight text-night-text">{school.name}</h1>
        <p className="m-0 text-sm text-night-muted">{school.city.nameRu}</p>
        {canClaim && <ClaimSchoolButton schoolSlug={school.slug} />}
      </div>

      {school.description && <p className="m-0 text-sm leading-relaxed text-night-muted">{school.description}</p>}

      {school.directions.length > 0 && (
        <div>
          {school.directions.map((d) => (
            <Tag key={d} className="bg-night-card2 text-night-pink">
              {d}
            </Tag>
          ))}
        </div>
      )}

      <Card className="border-night-border bg-night-card">
        <h2 className="m-0 mb-2 font-night text-base font-bold text-night-text">{t.school.contacts}</h2>
        <p className="m-0 text-sm text-night-muted">{school.contactPhone}</p>
        <p className="m-0 text-sm text-night-muted">{school.contactEmail}</p>
      </Card>

      {school.branches.length > 0 && (
        <div>
          <h2 className="m-0 mb-2 font-night text-base font-bold text-night-text">{t.school.branches}</h2>
          <ul className="m-0 list-none p-0 text-sm text-night-muted">
            {school.branches.map((b) => (
              <li key={b.id} className="border-b border-night-border py-2 first:pt-0 last:border-0">
                {b.address}
                {b.city ? ` (${b.city.nameRu})` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      {school.teachers.length > 0 && (
        <div>
          <h2 className="m-0 mb-2 font-night text-base font-bold text-night-text">{t.school.teachers}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {school.teachers.map((teacher) => (
              <Card key={teacher.id} className="border-night-border bg-night-card">
                {teacher.photoUrl && (
                  <img
                    src={teacher.photoUrl}
                    alt={teacher.name}
                    className="mb-2 aspect-square rounded-lg object-cover"
                  />
                )}
                <strong className="text-night-text">{teacher.name}</strong>
                {teacher.bio && <p className="mt-1 text-sm text-night-muted">{teacher.bio}</p>}
              </Card>
            ))}
          </div>
        </div>
      )}

      {school.schedules.length > 0 && (
        <div>
          <h2 className="m-0 mb-2 font-night text-base font-bold text-night-text">{t.school.schedule}</h2>
          <div className="overflow-x-auto rounded-app border border-night-border bg-night-card">
            <table className="w-full border-collapse text-sm text-night-muted">
              <tbody>
                {school.schedules.map((s) => (
                  <tr key={s.id} className="border-b border-night-border last:border-0">
                    <td className="px-3 py-2.5 text-night-text">{t.school.weekdays[s.weekday]}</td>
                    <td className="px-3 py-2.5">
                      {s.startTime}
                      {s.endTime ? `–${s.endTime}` : ""}
                    </td>
                    <td className="px-3 py-2.5">{t.event.levels[s.level]}</td>
                    <td className="px-3 py-2.5">{s.teacher?.name ?? "—"}</td>
                    <td className="px-3 py-2.5">{s.hall ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div>
        <h2 className="m-0 mb-2 font-night text-base font-bold text-night-text">
          {t.school.reviews}
          {avgRating && (
            <span className="ml-2 tracking-wide text-night-pink">
              {"★".repeat(Math.round(avgRating))} {avgRating.toFixed(1)}
            </span>
          )}
        </h2>
        {school.reviews.length === 0 ? (
          <p className="text-sm text-night-muted">{t.school.noReviewsYet}</p>
        ) : (
          <div className="flex flex-col gap-3">
            {school.reviews.map((r) => (
              <Card key={r.id} className="border-night-border bg-night-card">
                <p className="m-0 tracking-wide text-night-pink">
                  {"★".repeat(r.rating)}
                  {"☆".repeat(5 - r.rating)}
                </p>
                <p className="mt-1.5 text-sm text-night-text">{r.text}</p>
                <p className="mt-1.5 text-sm text-night-muted">
                  {r.author.dancer?.displayName ?? t.school.reviewAuthorFallback}
                </p>
                {/* Виден только автору — остальным такие отзывы не приходят с сервера вообще (см. getSchool) */}
                {r.moderationStatus === "PENDING" && (
                  <p className="mt-1 text-sm text-night-pink">{t.school.reviewPendingBadge}</p>
                )}
                {r.moderationStatus === "REJECTED" && (
                  <p className="mt-1 text-sm text-night-muted">{t.school.reviewRejectedBadge}</p>
                )}
              </Card>
            ))}
          </div>
        )}
        <div className="mt-4">
          <ReviewForm schoolSlug={school.slug} loggedIn={!!user} />
        </div>
      </div>
    </div>
  );
}
