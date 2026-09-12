import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { t } from "@/lib/i18n/dictionary";
import { ModerationRowActions } from "@/components/admin/moderation/ModerationRowActions";
import { SchoolClaimDetailModal } from "@/components/admin/moderation/SchoolClaimDetailModal";

// Перенесено из /moderation/schools (2026-09-11), редизайн под admin-*.
export default async function ModerationSchoolClaimsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isAdmin(user)) redirect("/admin");

  const claims = await prisma.schoolClaim.findMany({
    where: { status: "PENDING" },
    include: { school: { include: { city: true } }, claimant: true },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="m-0 font-night text-xl font-extrabold text-night-text sm:text-2xl">{t.moderation.schoolClaims}</h1>
        <p className="m-0 mt-1 text-sm text-admin-muted">Заявки "я представитель школы" на проверку</p>
      </div>

      <div className="overflow-x-auto rounded-app border border-admin-border bg-admin-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-admin-card2 text-xs font-semibold uppercase tracking-wide text-admin-disabled">
            <tr>
              <th className="px-3 py-2.5 font-semibold">{t.moderation.claimedSchool}</th>
              <th className="px-3 py-2.5 font-semibold">{t.moderation.claimant}</th>
              <th className="px-3 py-2.5 font-semibold">{t.moderation.claimNote}</th>
              <th className="px-3 py-2.5 font-semibold">{t.moderation.submittedAt}</th>
              <th className="px-3 py-2.5 text-right font-semibold">Действия</th>
            </tr>
          </thead>
          <tbody>
            {claims.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-admin-muted">
                  {t.moderation.noPendingClaims}
                </td>
              </tr>
            ) : (
              claims.map((c) => (
                <tr key={c.id} className="border-t border-admin-border align-top">
                  <td className="px-3 py-2.5">
                    {/* Клик по заявке — полная карточка школы (2026-09-12, по
                        прямому запросу пользователя): описание/направления/
                        контакты школы в строку таблицы не помещались вовсе. */}
                    <SchoolClaimDetailModal
                      claim={{
                        id: c.id,
                        schoolName: c.school.name,
                        schoolCityName: c.school.city.nameRu,
                        schoolDescription: c.school.description,
                        schoolDirections: c.school.directions,
                        schoolLevels: c.school.levels,
                        schoolContactPhone: c.school.contactPhone,
                        schoolContactEmail: c.school.contactEmail,
                        schoolVerificationStatus: c.school.verificationStatus,
                        schoolIsActive: c.school.isActive,
                        claimantEmail: c.claimant.email,
                        proofNote: c.proofNote,
                        createdAt: c.createdAt.toISOString(),
                      }}
                      actions={<ModerationRowActions endpoint={`/api/moderation/claims/${c.id}`} />}
                      trigger={
                        <div>
                          <p className="m-0 font-medium text-night-text underline decoration-admin-border decoration-dotted underline-offset-4">
                            {c.school.name}
                          </p>
                          <p className="m-0 text-xs text-admin-disabled">{c.school.city.nameRu}</p>
                        </div>
                      }
                    />
                  </td>
                  <td className="px-3 py-2.5 text-admin-muted">{c.claimant.email}</td>
                  <td className="px-3 py-2.5 max-w-[280px] text-admin-muted">{c.proofNote ?? "—"}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-admin-disabled">{c.createdAt.toLocaleDateString("ru-RU")}</td>
                  <td className="px-3 py-2.5">
                    <ModerationRowActions endpoint={`/api/moderation/claims/${c.id}`} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
