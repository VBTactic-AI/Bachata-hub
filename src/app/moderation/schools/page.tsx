import { redirect } from "next/navigation";
import { getCurrentUser, isModerator } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { t } from "@/lib/i18n/dictionary";
import { ModerationActions } from "@/components/ModerationActions";

export default async function ModerationSchoolClaimsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isModerator(user)) redirect("/");

  const claims = await prisma.schoolClaim.findMany({
    where: { status: "PENDING" },
    include: { school: { include: { city: true } }, claimant: true },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="stack">
      <h1 className="page-title">{t.moderation.schoolClaims}</h1>
      {claims.length === 0 ? (
        <p className="hint-text">{t.moderation.noPendingClaims}</p>
      ) : (
        <div className="stack" style={{ gap: 12 }}>
          {claims.map((c) => (
            <div key={c.id} className="card">
              <strong>
                {t.moderation.claimedSchool}: {c.school.name} ({c.school.city.nameRu})
              </strong>
              <p className="hint-text" style={{ margin: "4px 0" }}>
                {t.moderation.claimant}: {c.claimant.email}
              </p>
              {c.proofNote && (
                <p style={{ margin: "4px 0" }}>
                  {t.moderation.claimNote}: {c.proofNote}
                </p>
              )}
              <p className="hint-text" style={{ margin: 0 }}>
                {t.moderation.submittedAt}: {c.createdAt.toLocaleDateString("ru-RU")}
              </p>
              <ModerationActions endpoint={`/api/moderation/claims/${c.id}`} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
