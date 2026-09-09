import type { AdvancementStatus, RegistrationRole } from "@prisma/client";
import { REGISTRATION_ROLE_LABELS_PLURAL as ROLE_LABELS_PLURAL } from "@/lib/competition-labels";

export type RoundResultRow = {
  id: string;
  registration: {
    role: RegistrationRole;
    checkIn: { bibNumber: string | null } | null;
    dancer: { displayName: string };
  };
  // TIE_BREAK_REQUIRED сюда дойти не должен — раунд не становится COMPLETED,
  // пока не разрешится перетанцовка (advancement.ts) — но тип берём полный,
  // не подмножество, чтобы не расходиться с AdvancementStatus в схеме.
  status: AdvancementStatus;
  scoreSum: number;
};

// Список "прошёл/не прошёл" завершённого раунда — тот же визуальный язык,
// что и SideColumn/ParticipantRow в CompetitionMonitor.tsx (карточка-роль +
// пронумерованный бейдж, синий/розовый акцент Партнёры/Партнёрши). Вынесен
// из панели раунда на /admin/competitions/[id] (redesign 2026-09-09, по
// запросу пользователя) — используется и там, и на вкладке "Результаты"
// (ResultsWorkspace.tsx), чтобы не дублировать разметку в двух местах.
export function RoundResultsList({ results }: { results: RoundResultRow[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {(["LEADER", "FOLLOWER"] as const).map((r) => {
        const roleAccent = r === "LEADER" ? "#60a5fa" : "#f472b6";
        return (
          <div key={r} className="rounded-app border border-admin-border bg-admin-card2">
            <div className="flex items-center gap-2 border-b border-admin-border px-3.5 py-3">
              <span className="h-4 w-[3px] shrink-0 rounded-sm" style={{ background: roleAccent }} aria-hidden="true" />
              <h4 className="m-0 text-[13px] font-extrabold uppercase tracking-wide text-night-text">{ROLE_LABELS_PLURAL[r] ?? r}</h4>
            </div>
            <ul className="m-0 flex list-none flex-col gap-1 p-2">
              {results
                .filter((res) => res.registration.role === r)
                .map((res) => {
                  const advanced = res.status === "ADVANCED";
                  return (
                    <li key={res.id} className="flex items-center gap-2.5 rounded-app-sm px-2 py-1.5">
                      <span
                        className="grid h-7 min-w-[40px] shrink-0 place-items-center rounded-app-sm border border-admin-border bg-admin-bg/70 text-[13px] font-extrabold tabular-nums"
                        style={{ color: roleAccent }}
                      >
                        {res.registration.checkIn?.bibNumber ?? "—"}
                      </span>
                      <span className={`min-w-0 flex-1 truncate text-sm ${advanced ? "text-night-text" : "text-admin-disabled line-through"}`}>
                        {res.registration.dancer.displayName}
                      </span>
                      <span className={`shrink-0 text-xs font-bold tabular-nums ${advanced ? "text-night-success" : "text-admin-disabled"}`}>
                        {advanced ? "прошёл" : "не прошёл"} ({res.scoreSum})
                      </span>
                    </li>
                  );
                })}
            </ul>
          </div>
        );
      })}
      {results.length === 0 && <p className="m-0 text-sm text-admin-muted sm:col-span-2">Результатов пока нет.</p>}
    </div>
  );
}
