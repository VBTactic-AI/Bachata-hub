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
    <div className="stack">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div>
        <VerificationBadge status={school.verificationStatus} />
        <h1 className="page-title">{school.name}</h1>
        <p className="page-subtitle">{school.city.nameRu}</p>
        {canClaim && <ClaimSchoolButton schoolSlug={school.slug} />}
      </div>

      {school.description && <p>{school.description}</p>}

      {school.directions.length > 0 && (
        <div>
          {school.directions.map((d) => (
            <Tag key={d}>{d}</Tag>
          ))}
        </div>
      )}

      <Card>
        <h2 className="mt-0">{t.school.contacts}</h2>
        <p className="m-0">{school.contactPhone}</p>
        <p className="m-0">{school.contactEmail}</p>
      </Card>

      {school.branches.length > 0 && (
        <div>
          <h2 className="page-title">{t.school.branches}</h2>
          <ul>
            {school.branches.map((b) => (
              <li key={b.id}>
                {b.address}
                {b.city ? ` (${b.city.nameRu})` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}

      {school.teachers.length > 0 && (
        <div>
          <h2 className="page-title">{t.school.teachers}</h2>
          <div className="card-grid">
            {school.teachers.map((teacher) => (
              <Card key={teacher.id}>
                {teacher.photoUrl && (
                  <img
                    src={teacher.photoUrl}
                    alt={teacher.name}
                    className="mb-2 aspect-square rounded-lg object-cover"
                  />
                )}
                <strong>{teacher.name}</strong>
                {teacher.bio && <p className="hint-text">{teacher.bio}</p>}
              </Card>
            ))}
          </div>
        </div>
      )}

      {school.schedules.length > 0 && (
        <div>
          <h2 className="page-title">{t.school.schedule}</h2>
          <table className="w-full border-collapse">
            <tbody>
              {school.schedules.map((s) => (
                <tr key={s.id} className="border-b border-line">
                  <td className="py-1.5">{t.school.weekdays[s.weekday]}</td>
                  <td className="py-1.5">
                    {s.startTime}
                    {s.endTime ? `–${s.endTime}` : ""}
                  </td>
                  <td className="py-1.5">{t.event.levels[s.level]}</td>
                  <td className="py-1.5">{s.teacher?.name ?? "—"}</td>
                  <td className="py-1.5">{s.hall ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div>
        <h2 className="page-title">
          {t.school.reviews}
          {avgRating && (
            <span className="ml-2 tracking-wide text-accent">
              {"★".repeat(Math.round(avgRating))} {avgRating.toFixed(1)}
            </span>
          )}
        </h2>
        {school.reviews.length === 0 ? (
          <p className="hint-text">{t.school.noReviewsYet}</p>
        ) : (
          <div className="stack gap-3">
            {school.reviews.map((r) => (
              <Card key={r.id}>
                <p className="m-0 tracking-wide text-accent">
                  {"★".repeat(r.rating)}
                  {"☆".repeat(5 - r.rating)}
                </p>
                <p className="mt-1.5">{r.text}</p>
                <p className="hint-text mt-1.5">
                  {r.author.dancer?.displayName ?? t.school.reviewAuthorFallback}
                </p>
                {/* Виден только автору — остальным такие отзывы не приходят с сервера вообще (см. getSchool) */}
                {r.moderationStatus === "PENDING" && (
                  <p className="hint-text mt-1 text-accent">{t.school.reviewPendingBadge}</p>
                )}
                {r.moderationStatus === "REJECTED" && (
                  <p className="hint-text mt-1">{t.school.reviewRejectedBadge}</p>
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
