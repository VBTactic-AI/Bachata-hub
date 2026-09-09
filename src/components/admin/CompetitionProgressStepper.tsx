import type { ReactNode } from "react";
import type { CompetitionStatus } from "@prisma/client";
import { Card } from "@/components/ui/card";
import { COMPETITION_STATUS_LABELS, COMPETITION_STATUS_ORDER } from "@/lib/competition-labels";
import { cn } from "@/lib/cn";

// Горизонтальная полоса прогресса state machine соревнования (CLAUDE.md §9)
// на вкладке "Главная" — только отображение текущего Competition.status,
// переходы по-прежнему выполняет CompetitionStatusControls через
// state-transition service (см. src/server/state/competition-state.ts);
// `actions` — те самые кнопки перехода, вынесены сюда в шапку по запросу
// пользователя (2026-09-09), чтобы не быть отдельным блоком ниже.
//
// Сетка (не flex + абсолютная линия на каждый шаг), потому что при 10
// статусах и подписях длиннее одного слова ("Регистрация закрыта" и т.п.)
// прежний вариант считал соединительную линию исходя из ширины СВОЕЙ же
// колонки — без общего gap подписи наезжали друг на друга, а с gap линия
// рвалась (найдено пользователем вживую, 2026-09-09). Сетка с равными
// колонками + один сквозной прогресс-бар над кружками этого не допускает
// в принципе: колонки не могут перекрыться, а линия центрируется от
// первого до последнего кружка через проценты, а не через ширину колонки.
export function CompetitionProgressStepper({ status, actions }: { status: CompetitionStatus; actions?: ReactNode }) {
  const currentIndex = COMPETITION_STATUS_ORDER.indexOf(status);
  const total = COMPETITION_STATUS_ORDER.length;
  // Центр первой/последней колонки отстоит от края сетки на половину ширины
  // одной колонки (100% / total), а не на фиксированные пиксели — работает
  // при любой ширине контейнера и при любом числе статусов.
  const edgeInsetPercent = 100 / (2 * total);
  const spanPercent = 100 - 2 * edgeInsetPercent;
  const doneFraction = total > 1 ? currentIndex / (total - 1) : 0;
  const doneWidthPercent = spanPercent * doneFraction;

  return (
    <Card className="border-admin-border bg-admin-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 font-semibold text-night-text">Прогресс соревнования</p>
        {actions}
      </div>
      <div className="mt-4 overflow-x-auto pb-1">
        <div className="relative grid min-w-[640px] grid-flow-col auto-cols-fr">
          <div className="absolute top-[11px] h-0.5 bg-admin-border" style={{ left: `${edgeInsetPercent}%`, right: `${edgeInsetPercent}%` }} />
          <div
            className="absolute top-[11px] h-0.5 bg-night-success transition-all"
            style={{ left: `${edgeInsetPercent}%`, width: `${doneWidthPercent}%` }}
          />
          {COMPETITION_STATUS_ORDER.map((s, i) => {
            const done = i < currentIndex;
            const current = i === currentIndex;
            return (
              <div key={s} className="relative z-10 flex flex-col items-center gap-2 px-1">
                <div
                  className={cn(
                    "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold",
                    done && "border-night-success bg-night-success text-admin-bg",
                    current && "border-admin-primary bg-admin-primary text-white shadow-[0_0_0_4px_rgba(59,130,246,0.22)]",
                    !done && !current && "border-admin-border bg-admin-card2 text-transparent"
                  )}
                >
                  {done ? "✓" : current ? "●" : ""}
                </div>
                <span
                  className={cn(
                    "text-center text-[0.7rem] font-semibold leading-tight",
                    current ? "text-night-text" : done ? "text-admin-muted" : "text-admin-disabled"
                  )}
                >
                  {COMPETITION_STATUS_LABELS[s] ?? s}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
