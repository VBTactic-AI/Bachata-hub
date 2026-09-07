"use client";

import { useState } from "react";
import { REGISTRATION_ROLE_LABELS } from "@/lib/competition-labels";
import type { PublicDivisionProgress, PublicRoundProgressStatus } from "@/server/public/public-competition-view";

export type CategoryProgressItem = { id: string; categoryName: string; registrationsCount: number };

function StatusMark({ status }: { status: PublicRoundProgressStatus }) {
  if (status === "ADVANCED") return <span className="font-semibold text-night-success">✓</span>;
  if (status === "ELIMINATED") return <span className="font-semibold text-red-400">✗</span>;
  if (typeof status === "number") return <span className="font-semibold text-night-success">{status}</span>;
  return <span className="text-night-disabled">—</span>;
}

// По клику на категорию — таблица прогресса по раундам (2026-09-07, по
// запросу пользователя): колонки — реальные раунды дивизиона, строки —
// участники, ячейка появляется только после того, как организатор
// опубликовал результат ИМЕННО этого раунда (getPublicCompetitionView уже
// гейтит это через Round.advancementPublishedAt/Competition.publicResults —
// здесь просто рендер уже готовых данных, без своей бизнес-логики,
// CLAUDE.md §48). Данные для ВСЕХ категорий приходят с сервера сразу
// (divisionProgress) — раскрытие только переключает видимость, без
// дополнительного запроса.
export function CategoryProgressAccordion({ items, progress }: { items: CategoryProgressItem[]; progress: PublicDivisionProgress[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const progressByDivision = new Map(progress.map((p) => [p.divisionId, p]));

  return (
    <div className="stack gap-2">
      {items.map((d) => {
        const isOpen = openId === d.id;
        const divisionProgress = progressByDivision.get(d.id);
        return (
          <div key={d.id} className="rounded-app border border-night-border bg-night-card">
            <button
              type="button"
              onClick={() => setOpenId(isOpen ? null : d.id)}
              className="flex w-full items-center justify-between gap-2 bg-transparent p-3 text-left"
            >
              <span className="text-sm font-medium text-night-text">{d.categoryName}</span>
              <span className="flex items-center gap-2 text-sm text-night-muted">
                {d.registrationsCount} участников
                <span className={`transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden="true">
                  ▾
                </span>
              </span>
            </button>
            {isOpen && (
              <div className="border-t border-night-border p-3">
                {!divisionProgress || divisionProgress.columns.length === 0 ? (
                  <p className="m-0 text-sm text-night-muted">Раунды ещё не созданы.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr>
                          <th className="sticky left-0 z-10 whitespace-nowrap bg-night-card pr-2 text-left font-medium text-night-muted">
                            Участник
                          </th>
                          {divisionProgress.columns.map((c) => (
                            <th key={c.roundId} className="whitespace-nowrap px-2 text-center font-medium text-night-muted">
                              {c.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(["LEADER", "FOLLOWER"] as const).flatMap((role) => {
                          const rows = divisionProgress.rows.filter((r) => r.role === role);
                          if (rows.length === 0) return [];
                          return [
                            <tr key={`${role}-header`}>
                              <td className="sticky left-0 z-10 whitespace-nowrap bg-night-card pt-2 pr-2 text-xs uppercase tracking-wide text-night-muted">
                                {REGISTRATION_ROLE_LABELS[role]}
                              </td>
                              {divisionProgress.columns.map((c) => (
                                <td key={c.roundId} className="bg-night-card" />
                              ))}
                            </tr>,
                            ...rows.map((r, idx) => {
                              const rowBg = idx % 2 === 1 ? "bg-night-card2" : "bg-night-card";
                              return (
                                <tr key={`${r.bibNumber}-${r.displayName}`} className={rowBg}>
                                  <td className={`sticky left-0 z-10 whitespace-nowrap py-1 pl-1 pr-2 text-night-text ${rowBg}`}>
                                    №{r.bibNumber ?? "—"} {r.displayName}
                                  </td>
                                  {divisionProgress.columns.map((c) => (
                                    <td key={c.roundId} className="px-2 py-1 text-center">
                                      <StatusMark status={r.cells[c.roundId] ?? null} />
                                    </td>
                                  ))}
                                </tr>
                              );
                            }),
                          ];
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
