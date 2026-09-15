"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge, type StatusBadgeVariant } from "@/components/admin/StatusBadge";
import { Button } from "@/components/ui/button";

export type TicketPaymentInfo = { id: string; passId: string | null; passName: string | null; isPaid: boolean };
export type AssignablePassOption = { id: string; name: string };

// Оплата билетов участника (2026-09-16, Ticket Engine) — заменяет старый
// EventRegistrationPaymentToggle: оплата больше не поле EventRegistration,
// а живёт в Ticket (см. ticket-service.ts, комментарий у модели Ticket в
// schema.prisma). Три ветки отображения ТЕКУЩИХ билетов:
// - у события вообще нет Pass — простой тумблер, как раньше, но через
//   passless Ticket (заводится лениво при первом клике "Оплачено").
// - ровно один билет (с Pass или без) — тот же простой тумблер, но по
//   конкретному Ticket.id.
// - несколько билетов (танцор купил несколько разных Pass) — агрегат
//   (Оплачено/Частично оплачено/Не оплачено) + попап со списком билетов и
//   отдельным тумблером на каждый.
// Независимо от того, в какую из трёх веток попал танцор, ДОПОЛНИТЕЛЬНО
// рендерится пикер "Выдать Pass" (см. issuePicker ниже), если есть хотя бы
// один Pass, который он ещё не получал — раньше пикер показывался ТОЛЬКО при
// полном отсутствии билетов, из-за чего танцор с уже существующим passless-
// билетом (заведённым до появления Pass на событии) навсегда терял
// возможность получить Pass через этот экран (найдено вживую пользователем
// 2026-09-16: "есть Pass, но в участниках я его не вижу").
export function TicketPaymentCell({
  eventSlug,
  registrationId,
  dancerId,
  hasPassCatalog,
  initialTickets,
  assignablePasses,
}: {
  eventSlug: string;
  registrationId: string;
  dancerId: string;
  hasPassCatalog: boolean;
  initialTickets: TicketPaymentInfo[];
  // Активные Pass события (см. availableToIssue ниже — фильтруется до уже
  // купленных этим танцором) — пусто, если у события нет Pass или ни один
  // сейчас не в продаже.
  assignablePasses: AssignablePassOption[];
}) {
  const router = useRouter();
  // ВАЖНО: НЕ копировать initialTickets в useState — при повторном рендере
  // родителя (после router.refresh()) React не подставляет новый initial-
  // аргумент в уже смонтированный useState, и колонка навсегда застревала бы
  // на значении с первого рендера (реальный баг, найденный пользователем
  // 2026-09-16: "кликаю на Оплата, а колонка не обновляет статус"). Источник
  // истины — сам проп, обновляется автоматически вместе с рендером сервера.
  const tickets = initialTickets;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [selectedPassId, setSelectedPassId] = useState("");

  // Pass, которые этот танцор ещё не получал — сравниваем с уже имеющимися
  // билетами (2026-09-16, найдено вживую пользователем: у танцора уже был
  // billet БЕЗ Pass, заведённый простым тумблером ДО того, как на событии
  // вообще появился Pass, и пикер выдачи после этого никогда не показывался,
  // потому что раньше он рисовался только при tickets.length === 0). Танцор
  // может получить Pass в любой момент, независимо от того, сколько у него
  // уже других билетов — фильтруем только те Pass, что он уже купил.
  const ownedPassIds = new Set(tickets.map((t) => t.passId).filter((id): id is string => id != null));
  const availableToIssue = assignablePasses.filter((p) => !ownedPassIds.has(p.id));
  // НЕ полагаться на selectedPassId как на единственный источник истины (тот
  // же класс бага, что и с initialTickets/useState выше) — если сохранённый
  // выбор больше не входит в актуальный список (например, событие только что
  // обновилось), тихо откатываемся на первый доступный вариант.
  const effectivePassId = availableToIssue.some((p) => p.id === selectedPassId) ? selectedPassId : (availableToIssue[0]?.id ?? "");

  // Выдать танцору конкретный Pass (2026-09-16, по прямому запросу
  // пользователя — иначе на событии с Pass в принципе не появлялось ни
  // одного Ticket с passId, из-за чего "Продано"/"Выручка" на вкладке
  // "Билеты" оставались 0 навсегда). Сразу отмечаем оплаченным — тот же
  // принцип, что и у простого passless-тумблера ("организатор уже получил
  // деньги в момент выдачи"); если это не так, оплату можно снять сразу
  // после через обычный тумблер этой же ячейки.
  async function issuePass() {
    if (!effectivePassId) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/events/${eventSlug}/passes/${effectivePassId}/tickets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dancerId, markPaid: true }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.message || data.error || "Не удалось выдать Pass.");
      return;
    }
    router.refresh();
  }

  // "Простой" случай (0 или 1 билет) — если билета ещё нет, бьём в
  // registration-эндпоинт (лениво заводит passless Ticket); если есть —
  // сразу в ticket-эндпоинт по его id.
  async function toggleSimple(existing: TicketPaymentInfo | undefined, nextPaid: boolean) {
    setLoading(true);
    setError(null);
    const url = existing
      ? `/api/events/${eventSlug}/tickets/${existing.id}/payment`
      : `/api/events/${eventSlug}/registrations/${registrationId}/payment`;
    const res = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isPaid: nextPaid }) });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.message || data.error || "Не удалось изменить статус оплаты.");
      return;
    }
    router.refresh();
  }

  async function toggleOne(ticketId: string, nextPaid: boolean) {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/events/${eventSlug}/tickets/${ticketId}/payment`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPaid: nextPaid }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.message || data.error || "Не удалось изменить статус оплаты.");
      return;
    }
    router.refresh();
  }

  if (!hasPassCatalog) {
    const isPaid = tickets[0]?.isPaid ?? false;
    return (
      <span className="inline-flex items-center gap-1.5">
        <button
          type="button"
          disabled={loading}
          onClick={() => toggleSimple(tickets[0], !isPaid)}
          className="disabled:cursor-not-allowed disabled:opacity-50"
        >
          <StatusBadge label={isPaid ? "Оплачено" : "Не оплачено"} variant={isPaid ? "success" : "danger"} />
        </button>
        {error && <span className="text-xs text-red-400">{error}</span>}
      </span>
    );
  }

  // Пикер "Выдать Pass" — рендерится вместе с текущими билетами танцора, а
  // не вместо них, и виден, только если есть хотя бы один Pass, который он
  // ещё не получал.
  const issuePicker = availableToIssue.length > 0 && (
    <span className="inline-flex flex-col items-start gap-1">
      <select
        value={effectivePassId}
        onChange={(e) => setSelectedPassId(e.target.value)}
        disabled={loading}
        className="rounded-app-sm border border-admin-border bg-admin-card2 px-1.5 py-0.5 text-xs text-night-text"
      >
        {availableToIssue.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={loading}
        onClick={issuePass}
        className="text-xs text-admin-primaryHover hover:underline disabled:cursor-not-allowed disabled:opacity-50"
      >
        Выдать Pass
      </button>
    </span>
  );

  if (tickets.length === 0) {
    return (
      <span className="inline-flex flex-col items-start gap-1">
        {issuePicker || <span className="text-sm text-admin-muted">—</span>}
        {error && <span className="text-xs text-red-400">{error}</span>}
      </span>
    );
  }

  if (tickets.length === 1) {
    const t = tickets[0];
    return (
      <span className="inline-flex flex-col items-start gap-1">
        <span className="text-xs text-admin-muted">{t.passName ?? "Входной билет"}</span>
        <button
          type="button"
          disabled={loading}
          onClick={() => toggleOne(t.id, !t.isPaid)}
          className="disabled:cursor-not-allowed disabled:opacity-50"
        >
          <StatusBadge label={t.isPaid ? "Оплачено" : "Не оплачено"} variant={t.isPaid ? "success" : "danger"} />
        </button>
        {issuePicker}
        {error && <span className="text-xs text-red-400">{error}</span>}
      </span>
    );
  }

  const paidCount = tickets.filter((t) => t.isPaid).length;
  const summaryLabel = paidCount === tickets.length ? "Оплачено" : paidCount === 0 ? "Не оплачено" : "Частично оплачено";
  const summaryVariant: StatusBadgeVariant = paidCount === tickets.length ? "success" : paidCount === 0 ? "danger" : "warning";

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="rounded-app-sm px-1 py-0.5 text-left transition-colors hover:bg-admin-card2">
        <span className="flex flex-col items-start gap-1">
          <span className="max-w-[220px] truncate text-xs text-admin-muted">{tickets.map((t) => t.passName ?? "Входной билет").join(", ")}</span>
          <StatusBadge label={summaryLabel} variant={summaryVariant} />
        </span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5" onClick={() => setOpen(false)} role="presentation">
          <div
            className="flex max-h-[80vh] w-full max-w-[420px] flex-col overflow-hidden rounded-app border border-admin-border bg-admin-card shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ticket-payment-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-admin-border px-5 py-4">
              <h3 id="ticket-payment-title" className="m-0 text-[17px] font-extrabold text-night-text">
                Билеты участника
              </h3>
            </div>
            <div className="flex-1 overflow-y-auto py-1.5">
              {tickets.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-3 px-5 py-2.5 hover:bg-admin-card2">
                  <span className="truncate text-sm font-semibold text-night-text">{t.passName ?? "Входной билет"}</span>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => toggleOne(t.id, !t.isPaid)}
                    className="shrink-0 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <StatusBadge label={t.isPaid ? "Оплачено" : "Не оплачено"} variant={t.isPaid ? "success" : "danger"} />
                  </button>
                </div>
              ))}
            </div>
            {issuePicker && <div className="border-t border-admin-border px-5 py-3">{issuePicker}</div>}
            {error && <p className="m-0 px-5 py-2 text-xs text-red-400">{error}</p>}
            <div className="flex items-center justify-end gap-2 border-t border-admin-border px-5 py-4">
              <Button type="button" size="sm" variant="ghost" className="text-admin-muted hover:text-admin-primaryHover" onClick={() => setOpen(false)}>
                Закрыть
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
