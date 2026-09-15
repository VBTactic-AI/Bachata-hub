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
}: {
  ticketsCount: number;
  passesCount: number;
  ticketsPanel: ReactNode;
  passesPanel: ReactNode;
}) {
  const [tab, setTab] = useState<"tickets" | "passes">("tickets");

  const TAB_CLASS = (active: boolean) =>
    `rounded-app-sm px-3 py-1.5 text-sm font-semibold transition-colors ${
      active ? "bg-admin-primary text-white" : "text-admin-muted hover:bg-admin-card2 hover:text-night-text"
    }`;

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
