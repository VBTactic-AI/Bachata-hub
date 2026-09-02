import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { t } from "@/lib/i18n/dictionary";
import { VerificationBadge } from "@/components/VerificationBadge";
import { ReviewForm } from "@/components/ReviewForm";
import { ClaimSchoolButton } from "@/components/ClaimSchoolButton";

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
            <span key={d} className="tag">
              {d}
            </span>
          ))}
        </div>
      )}

      <div className="card">
        <h2 style={{ marginTop: 0 }}>{t.school.contacts}</h2>
        <p style={{ margin: 0 }}>{school.contactPhone}</p>
        <p style={{ margin: 0 }}>{school.contactEmail}</p>
      </div>

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
              <div key={teacher.id} className="card">
                {teacher.photoUrl && (
                  <img
                    src={teacher.photoUrl}
                    alt={teacher.name}
                    style={{ borderRadius: 8, marginBottom: 8, aspectRatio: "1", objectFit: "cover" }}
                  />
                )}
                <strong>{teacher.name}</strong>
                {teacher.bio && <p className="hint-text">{teacher.bio}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {school.schedules.length > 0 && (
        <div>
          <h2 className="page-title">{t.school.schedule}</h2>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              {school.schedules.map((s) => (
                <tr key={s.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <td style={{ padding: "6px 0" }}>{t.school.weekdays[s.weekday]}</td>
                  <td style={{ padding: "6px 0" }}>
                    {s.startTime}
                    {s.endTime ? `–${s.endTime}` : ""}
                  </td>
                  <td style={{ padding: "6px 0" }}>{t.event.levels[s.level]}</td>
                  <td style={{ padding: "6px 0" }}>{s.teacher?.name ?? "—"}</td>
                  <td style={{ padding: "6px 0" }}>{s.hall ?? ""}</td>
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
            <span className="stars" style={{ marginLeft: 8 }}>
              {"★".repeat(Math.round(avgRating))} {avgRating.toFixed(1)}
            </span>
          )}
        </h2>
        {school.reviews.length === 0 ? (
          <p className="hint-text">{t.school.noReviewsYet}</p>
        ) : (
          <div className="stack" style={{ gap: 12 }}>
            {school.reviews.map((r) => (
              <div key={r.id} className="card">
                <p className="stars" style={{ margin: 0 }}>
                  {"★".repeat(r.rating)}
                  {"☆".repeat(5 - r.rating)}
                </p>
                <p style={{ margin: "6px 0 0" }}>{r.text}</p>
                <p className="hint-text" style={{ margin: "6px 0 0" }}>
                  {r.author.dancer?.displayName ?? t.school.reviewAuthorFallback}
                </p>
                {/* Виден только автору — остальным такие отзывы не приходят с сервера вообще (см. getSchool) */}
                {r.moderationStatus === "PENDING" && (
                  <p className="hint-text" style={{ margin: "4px 0 0", color: "var(--color-accent, inherit)" }}>
                    {t.school.reviewPendingBadge}
                  </p>
                )}
                {r.moderationStatus === "REJECTED" && (
                  <p className="hint-text" style={{ margin: "4px 0 0" }}>
                    {t.school.reviewRejectedBadge}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
        <div style={{ marginTop: 16 }}>
          <ReviewForm schoolSlug={school.slug} loggedIn={!!user} />
        </div>
      </div>
    </div>
  );
}
