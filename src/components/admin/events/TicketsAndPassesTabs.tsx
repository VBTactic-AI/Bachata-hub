"use client";

import { useState, type ReactNode } from "react";

// "🎟 Билеты" (2026-09-16, Ticket Engine v2; переименовано из "Билеты и
// Pass" и разбито на ТРИ суб-вкладки 2026-09-18, по прямому запросу
// пользователя) — простой клиентский переключатель под-вкладок внутри
// одной страницы (не отдельные роуты — все панели уже загружены сервером,
// переключение чисто визуальное). Промокоды вынесены из панели "Pass" в
// отдельную суб-вкладку — раньше жили только там, теперь применимы и к
// Pass, и к TicketType (см. комментарий у PromoCode.ticketTypes в
// schema.prisma), смешивать их с одним конкретным каталогом больше не
// имеет смысла.
export function TicketsAndPassesTabs({
  ticketsCount,
  passesCount,
  promoCodesCount,
  ticketsPanel,
  passesPanel,
  promoCodesPanel,
  showPasses = true,
  showPromoCodes = true,
}: {
  ticketsCount: number;
  passesCount: number;
  promoCodesCount: number;
  ticketsPanel: ReactNode;
  passesPanel: ReactNode;
  promoCodesPanel: ReactNode;
  // Pass — только для фестивалей (2026-09-16, по прямому запросу
  // пользователя): для остальных форматов Pass не имеет смысла (доступ к
  // нескольким пунктам программы), поэтому таб скрывается. Событие, у
  // которого Pass уже реально существует (заведён до этого правила),
  // продолжает показывать таб — иначе организатор потерял бы доступ к уже
  // проданным Pass молча (см. страницу, которая передаёт этот проп).
  showPasses?: boolean;
  // Промокоды — конфигурация события, только владелец/ADMIN (тот же
  // уровень доступа, что и раньше внутри панели "Pass", см. passes/page.tsx)
  // — для остальных вкладка просто не рендерится, а не показывает пустую
  // панель без возможности что-либо сделать.
  showPromoCodes?: boolean;
}) {
  const [tab, setTab] = useState<"tickets" | "promocodes" | "passes">("tickets");

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
        {showPromoCodes && (
          <button type="button" className={TAB_CLASS(tab === "promocodes")} onClick={() => setTab("promocodes")}>
            Промокоды ({promoCodesCount})
          </button>
        )}
        {showPasses && (
          <button type="button" className={TAB_CLASS(tab === "passes")} onClick={() => setTab("passes")}>
            Pass ({passesCount})
          </button>
        )}
      </div>
      {tab === "tickets" && ticketsPanel}
      {tab === "promocodes" && showPromoCodes && promoCodesPanel}
      {tab === "passes" && showPasses && passesPanel}
    </div>
  );
}
