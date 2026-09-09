import type { CompetitionStatus } from "@prisma/client";
import { Card } from "@/components/ui/card";
import { COMPETITION_STATUS_LABELS, COMPETITION_STATUS_ORDER } from "@/lib/competition-labels";
import { cn } from "@/lib/cn";

// Горизонтальная полоса прогресса state machine соревнования (CLAUDE.md §9)
// на вкладке "Главная" — только отображение текущего Competition.status,
// переходы по-прежнему выполняет CompetitionStatusControls через
// state-transition service (см. src/server/state/competition-state.ts).
export function CompetitionProgressStepper({ status }: { status: CompetitionStatus }) {
  const currentIndex = COMPETITION_STATUS_ORDER.indexOf(status);

  return (
    <Card className="border-admin-border bg-admin-card">
      <p className="m-0 mb-1 font-semibold text-night-text">Прогресс соревнования</p>
      <div className="mt-3 flex items-start overflow-x-auto pb-1">
        {COMPETITION_STATUS_ORDER.map((s, i) => {
          const done = i < currentIndex;
          const current = i === currentIndex;
          return (
            <div key={s} className="flex min-w-[104px] flex-col items-center gap-2 first:min-w-0">
              <div className="relative flex w-full items-center">
                <div
                  className={cn(
                    "absolute right-1/2 h-0.5 w-full",
                    i === 0 ? "hidden" : done ? "bg-night-success" : "bg-admin-border"
                  )}
                />
                <div
                  className={cn(
                    "relative z-10 mx-auto flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold",
                    done && "border-night-success bg-night-success text-admin-bg",
                    current && "border-admin-primary bg-admin-primary text-white shadow-[0_0_0_4px_rgba(59,130,246,0.22)]",
                    !done && !current && "border-admin-border bg-admin-card2 text-transparent"
                  )}
                >
                  {done ? "✓" : current ? "●" : ""}
                </div>
              </div>
              <span
                className={cn(
                  "text-center text-[0.72rem] font-semibold leading-tight",
                  current ? "text-night-text" : done ? "text-admin-muted" : "text-admin-disabled"
                )}
              >
                {COMPETITION_STATUS_LABELS[s] ?? s}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
