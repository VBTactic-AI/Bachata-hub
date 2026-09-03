import { redirect } from "next/navigation";
import { getCurrentUser, isModerator } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { t } from "@/lib/i18n/dictionary";

export default async function ModerationLogPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isModerator(user)) redirect("/");

  const logs = await prisma.moderationLog.findMany({
    include: { actor: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="stack">
      <h1 className="page-title">{t.moderation.log}</h1>
      {logs.length === 0 ? (
        <p className="hint-text">{t.moderation.logEmpty}</p>
      ) : (
        <table className="w-full border-collapse">
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="border-b border-line">
                <td className="whitespace-nowrap py-1.5 pr-2">{l.createdAt.toLocaleString("ru-RU")}</td>
                <td className="px-2 py-1.5">{l.actor.email}</td>
                <td className="px-2 py-1.5">{l.entity}</td>
                <td className="px-2 py-1.5">{l.action}</td>
                <td className="py-1.5">{l.reason ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
