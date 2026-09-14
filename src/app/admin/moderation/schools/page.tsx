import { redirect } from "next/navigation";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { t } from "@/lib/i18n/dictionary";
import { ModerationRowActions } from "@/components/admin/moderation/ModerationRowActions";
import { AccessRequestDetailModal } from "@/components/admin/moderation/AccessRequestDetailModal";
import { listAccessRequestsByType } from "@/server/access-requests/queries";
import type { SchoolHeadPayload } from "@/server/access-requests/schemas";

// Перенесено из /moderation/schools (2026-09-11), редизайн под admin-*.
// Источник данных сменился со SchoolClaim (модель удалена) на
// AccessRequest(type: SCHOOL_HEAD) — см. docs/00_DECISIONS.md, 2026-09-14.
export default async function ModerationSchoolAccessRequestsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isAdmin(user)) redirect("/admin");

  const requests = await listAccessRequestsByType("SCHOOL_HEAD");

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="m-0 font-night text-xl font-extrabold text-night-text sm:text-2xl">{t.moderation.schoolClaims}</h1>
        <p className="m-0 mt-1 text-sm text-admin-muted">Заявки "Руководитель школы" на проверку</p>
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
            {requests.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-admin-muted">
                  {t.moderation.noPendingClaims}
                </td>
              </tr>
            ) : (
              requests.map((r) => {
                const payload = r.payload as unknown as SchoolHeadPayload;
                const links = (r.links as unknown as { type: string; url: string }[]) ?? [];
                return (
                  <tr key={r.id} className="border-t border-admin-border align-top">
                    <td className="px-3 py-2.5">
                      <AccessRequestDetailModal
                        request={{
                          id: r.id,
                          brandName: r.brandName,
                          description: r.description,
                          cityName: r.city?.nameRu ?? null,
                          countryName: r.country?.nameRu ?? null,
                          applicantEmail: r.user.email,
                          phone: r.phone,
                          links,
                          teachingStyles: payload.teachingStyles ?? [],
                          teachersCount: payload.teachersCount ?? "—",
                          hasRegularClasses: !!payload.hasRegularClasses,
                          status: r.status,
                          createdAt: r.createdAt.toISOString(),
                        }}
                        actions={<ModerationRowActions endpoint={`/api/moderation/access-requests/${r.id}`} showNeedsInfo />}
                        trigger={
                          <div>
                            <p className="m-0 font-medium text-night-text underline decoration-admin-border decoration-dotted underline-offset-4">
                              {r.brandName}
                            </p>
                            <p className="m-0 text-xs text-admin-disabled">{r.city?.nameRu ?? "—"}</p>
                          </div>
                        }
                      />
                    </td>
                    <td className="px-3 py-2.5 text-admin-muted">{r.user.email}</td>
                    <td className="px-3 py-2.5 max-w-[280px] text-admin-muted">{r.description}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-admin-disabled">
                      {r.createdAt.toLocaleDateString("ru-RU")}
                    </td>
                    <td className="px-3 py-2.5">
                      <ModerationRowActions endpoint={`/api/moderation/access-requests/${r.id}`} showNeedsInfo />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
