"use client";

import { useState, type ReactNode } from "react";

// "🎟 Билеты и Pass" (2026-09-16, Ticket Engine v2) — простой клиентский
// переключатель под-вкладок Билеты/Pass внутри одной страницы (не отдельные
// роуты — обе панели уже загружены сервером, переключение чисто визуальное).
export function TicketsAndPassesTabs({
  ticketsCount,
  passesCount,
  ticketsPanel,
  passesPanel,
  showPasses = true,
}: {
  ticketsCount: number;
  passesCount: number;
  ticketsPanel: ReactNode;
  passesPanel: ReactNode;
  // Pass — только для фестивалей (2026-09-16, по прямому запросу
  // пользователя): для остальных форматов Pass не имеет смысла (доступ к
  // нескольким пунктам программы), поэтому таб скрывается. Событие, у
  // которого Pass уже реально существует (заведён до этого правила),
  // продолжает показывать таб — иначе организатор потерял бы доступ к уже
  // проданным Pass молча (см. страницу, которая передаёт этот проп).
  showPasses?: boolean;
}) {
  const [tab, setTab] = useState<"tickets" | "passes">("tickets");

  const TAB_CLASS = (active: boolean) =>
    `rounded-app-sm px-3 py-1.5 text-sm font-semibold transition-colors ${
      active ? "bg-admin-primary text-white" : "text-admin-muted hover:bg-admin-card2 hover:text-night-text"
    }`;

  if (!showPasses) return <div className="flex flex-col gap-3">{ticketsPanel}</div>;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1.5 rounded-app border border-admin-border bg-admin-card p-1">
        <button type="button" className={TAB_CLASS(tab === "tickets")} onClick={() => setTab("tickets")}>
          Билеты ({ticketsCount})
        </button>
        <button type="button" className={TAB_CLASS(tab === "passes")} onClick={() => setTab("passes")}>
          Pass ({passesCount})
        </button>
      </div>
      {tab === "tickets" ? ticketsPanel : passesPanel}
    </div>
  );
}
