import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { VerificationBadge } from "@/components/VerificationBadge";

// Мониторинг → "Школы (просмотр)" — только на просмотр (по прямому решению
// пользователя, 2026-09-14): редактирование карточки школы — только у самого
// владельца, в /admin/school.
export default async function SystemSchoolsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isAdmin(user)) redirect("/admin");

  const schools = await prisma.school.findMany({
    include: { city: true, owner: true, _count: { select: { teachers: true, branches: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="m-0 font-night text-xl font-extrabold text-night-text sm:text-2xl">Школы</h1>
        <p className="m-0 mt-1 text-sm text-admin-muted">Только просмотр — все школы платформы.</p>
      </div>

      <div className="overflow-x-auto rounded-app border border-admin-border bg-admin-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-admin-card2 text-xs font-semibold uppercase tracking-wide text-admin-disabled">
            <tr>
              <th className="px-3 py-2.5 font-semibold">Школа</th>
              <th className="px-3 py-2.5 font-semibold">Город</th>
              <th className="px-3 py-2.5 font-semibold">Статус</th>
              <th className="px-3 py-2.5 font-semibold">Владелец</th>
              <th className="px-3 py-2.5 font-semibold">Преподавателей</th>
            </tr>
          </thead>
          <tbody>
            {schools.map((s) => (
              <tr key={s.id} className="border-t border-admin-border">
                <td className="px-3 py-2.5">
                  <Link href={`/schools/${s.slug}`} target="_blank" className="text-night-text underline decoration-admin-border decoration-dotted underline-offset-4">
                    {s.name}
                  </Link>
                </td>
                <td className="px-3 py-2.5 text-admin-muted">{s.city.nameRu}</td>
                <td className="px-3 py-2.5">
                  <VerificationBadge status={s.verificationStatus} />
                </td>
                <td className="px-3 py-2.5 text-admin-muted">{s.owner?.email ?? "—"}</td>
                <td className="px-3 py-2.5 text-admin-muted">{s._count.teachers}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
