import type { TopFinalParticipant } from "@/server/statistics/judging-analytics";

// Топ-10 участников финала по сумме баллов судей (2026-09-11, по прямому
// решению пользователя) — БЕЗ разделения по ролям и без нормализации между
// дивизионами: просто FinalResult.totalScore по убыванию, как есть. Дивизионы
// с разными критериями/шкалами оказываются в одном списке сознательно —
// пользователь выбрал этот вариант вместо разделения по ролям/дивизионам.
// Скейтинг-система (RELATIVE_PLACEMENT) исключена на уровне запроса — там
// totalScore хранит место, а не сумму баллов (docs/00_DECISIONS.md A27).
export function TopParticipantsPanel({ participants }: { participants: TopFinalParticipant[] }) {
  if (participants.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 font-semibold text-night-text">Топ-10 участников финала (по сумме баллов судей)</p>
      <div className="overflow-hidden rounded-app border border-admin-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-admin-card2 text-xs font-semibold uppercase tracking-wide text-admin-disabled">
            <tr>
              <th className="px-3 py-2 font-semibold">#</th>
              <th className="px-3 py-2 font-semibold">Номер</th>
              <th className="px-3 py-2 font-semibold">Имя</th>
              <th className="px-3 py-2 font-semibold">Роль</th>
              <th className="px-3 py-2 font-semibold">Категория</th>
              <th className="px-3 py-2 text-right font-semibold">Баллы</th>
            </tr>
          </thead>
          <tbody>
            {participants.map((p, i) => (
              <tr key={p.registrationId} className="border-t border-admin-border bg-admin-card">
                <td className="px-3 py-2 font-bold text-admin-primaryHover">{i + 1}</td>
                <td className="px-3 py-2 text-admin-muted">{p.bibNumber ?? "—"}</td>
                <td className="px-3 py-2 font-semibold text-night-text">{p.name}</td>
                <td className="px-3 py-2 text-admin-muted">{p.role}</td>
                <td className="px-3 py-2 text-admin-muted">{p.categoryName}</td>
                <td className="px-3 py-2 text-right font-bold text-night-text">{p.totalScore}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
