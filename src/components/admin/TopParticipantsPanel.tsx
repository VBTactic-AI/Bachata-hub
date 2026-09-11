import type { TopFinalParticipant } from "@/server/statistics/judging-analytics";

// Топ-10 участников финала по сумме баллов судей (2026-09-11, по прямому
// решению пользователя) — БЕЗ разделения по ролям и без нормализации между
// дивизионами: просто FinalResult.totalScore по убыванию, как есть. Дивизионы
// с разными критериями/шкалами оказываются в одном списке сознательно —
// пользователь выбрал этот вариант вместо разделения по ролям/дивизионам.
// Скейтинг-система (RELATIVE_PLACEMENT) исключена на уровне запроса — там
// totalScore хранит место, а не сумму баллов (docs/00_DECISIONS.md A27).
//
// Строка с полосой вместо голой таблицы (редизайн по референсу пользователя,
// 2026-09-11) — длина полосы относительно лидера списка, чтобы разрыв между
// местами был виден на глаз, а не только по цифрам.
export function TopParticipantsPanel({ participants }: { participants: TopFinalParticipant[] }) {
  if (participants.length === 0) return null;
  const maxScore = Math.max(1, ...participants.map((p) => p.totalScore));

  return (
    <div className="flex flex-col gap-2 rounded-app border border-admin-border bg-admin-card p-3">
      <p className="m-0 font-semibold text-night-text">Топ-10 по общей сумме баллов (финал)</p>
      <div className="flex flex-col gap-1.5">
        {participants.map((p, i) => (
          <div key={p.registrationId} className="flex items-center gap-3">
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                i === 0 ? "bg-admin-primary text-white" : "bg-admin-card2 text-admin-muted"
              }`}
            >
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-semibold text-night-text">
                  №{p.bibNumber ?? "—"} {p.name}
                </span>
                <span className="shrink-0 text-sm font-bold text-night-text">{p.totalScore}</span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-admin-border">
                <div className="h-full rounded-full bg-admin-primary" style={{ width: `${(p.totalScore / maxScore) * 100}%` }} />
              </div>
              <p className="m-0 mt-0.5 text-xs text-admin-disabled">
                {p.role} · {p.categoryName}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
