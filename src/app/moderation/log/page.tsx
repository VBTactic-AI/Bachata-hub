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
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                <td style={{ padding: "6px 8px 6px 0", whiteSpace: "nowrap" }}>
                  {l.createdAt.toLocaleString("ru-RU")}
                </td>
                <td style={{ padding: "6px 8px" }}>{l.actor.email}</td>
                <td style={{ padding: "6px 8px" }}>{l.entity}</td>
                <td style={{ padding: "6px 8px" }}>{l.action}</td>
                <td style={{ padding: "6px 0" }}>{l.reason ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
