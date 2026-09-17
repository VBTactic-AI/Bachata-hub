"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge, type StatusBadgeVariant } from "@/components/admin/StatusBadge";
import { Button } from "@/components/ui/button";

export type TicketPaymentInfo = {
  id: string;
  passId: string | null;
  passName: string | null;
  ticketTypeId: string | null;
  ticketTypeName: string | null;
  isPaid: boolean;
  // TicketCheckIn (Commerce Engine v1, 2026-09-17) — явка по этому билету.
  checkedIn: boolean;
};
export type AssignablePassOption = { id: string; name: string };
export type AssignableTicketTypeOption = { id: string; name: string };
export type FestivalPassMatch = { passId: string; passName: string };

// Оплата билетов участника (2026-09-16, Ticket Engine v2) — заменяет старый
// EventRegistrationPaymentToggle: оплата больше не поле EventRegistration,
// а живёт в Ticket (см. ticket-service.ts, комментарий у модели Ticket в
// schema.prisma). Три ветки отображения ТЕКУЩИХ билетов:
// - у события вообще нет ни Pass, ни TicketType — простой тумблер, как
//   раньше, но через passless/typeless Ticket (заводится лениво при первом
//   клике "Оплачено").
// - ровно один билет (с Pass/TicketType или без) — тот же простой тумблер,
//   но по конкретному Ticket.id.
// - несколько билетов (танцор купил несколько разных Pass/TicketType) —
//   агрегат (Оплачено/Частично оплачено/Не оплачено) + попап со списком
//   билетов и отдельным тумблером на каждый.
// Независимо от ветки, ДОПОЛНИТЕЛЬНО рендерятся пикеры "Выдать Pass"/"Выдать
// билет" (см. issuePicker/issueTicketTypePicker ниже), если есть хотя бы
// один вариант, который танцор ещё не получал — раньше пикер показывался
// ТОЛЬКО при полном отсутствии билетов, из-за чего танцор с уже
// существующим passless-билетом (заведённым до появления каталога на
// событии) навсегда терял возможность получить Pass через этот экран
// (найдено вживую пользователем 2026-09-16: "есть Pass, но в участниках я
// его не вижу").
export function TicketPaymentCell({
  eventSlug,
  registrationId,
  dancerId,
  hasPassCatalog,
  hasTicketTypeCatalog,
  initialTickets,
  assignablePasses,
  assignableTicketTypes,
  festivalPassMatch,
}: {
  eventSlug: string;
  registrationId: string;
  dancerId: string;
  hasPassCatalog: boolean;
  hasTicketTypeCatalog: boolean;
  initialTickets: TicketPaymentInfo[];
  // Активные Pass/TicketType события (см. availableToIssue ниже —
  // фильтруется до уже купленных этим танцором) — пусто, если у события нет
  // соответствующего каталога или ни один сейчас не в продаже.
  assignablePasses: AssignablePassOption[];
  assignableTicketTypes: AssignableTicketTypeOption[];
  // Этап 3 — действующий Pass фестиваля (см. findFestivalPassForEvent в
  // ticket-service.ts), дающий доступ ИМЕННО к этому (дочернему) событию,
  // если это событие вообще является пунктом программы какого-то фестиваля
  // и танцор такой Pass держит. null/undefined — не применимо.
  festivalPassMatch?: FestivalPassMatch | null;
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
  const [selectedTicketTypeId, setSelectedTicketTypeId] = useState("");

  // Pass/TicketType, которые этот танцор ещё не получал — сравниваем с уже
  // имеющимися билетами (см. комментарий у функции выше про регрессию).
  const ownedPassIds = new Set(tickets.map((t) => t.passId).filter((id): id is string => id != null));
  const ownedTicketTypeIds = new Set(tickets.map((t) => t.ticketTypeId).filter((id): id is string => id != null));
  const availableToIssue = assignablePasses.filter((p) => !ownedPassIds.has(p.id));
  const availableTicketTypesToIssue = assignableTicketTypes.filter((t) => !ownedTicketTypeIds.has(t.id));
  // НЕ полагаться на selected*Id как на единственный источник истины (тот же
  // класс бага, что и с initialTickets/useState выше) — если сохранённый
  // выбор больше не входит в актуальный список, тихо откатываемся на первый
  // доступный вариант.
  const effectivePassId = availableToIssue.some((p) => p.id === selectedPassId) ? selectedPassId : (availableToIssue[0]?.id ?? "");
  const effectiveTicketTypeId = availableTicketTypesToIssue.some((t) => t.id === selectedTicketTypeId)
    ? selectedTicketTypeId
    : (availableTicketTypesToIssue[0]?.id ?? "");
  const hasFestivalPassEntry = festivalPassMatch != null && tickets.some((t) => t.passId === festivalPassMatch.passId);

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

  // Выдать TicketType — зеркалит issuePass() выше, для простого билета.
  async function issueTicketType() {
    if (!effectiveTicketTypeId) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/events/${eventSlug}/ticket-types/${effectiveTicketTypeId}/tickets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dancerId, markPaid: true }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.message || data.error || "Не удалось выдать билет.");
      return;
    }
    router.refresh();
  }

  // Этап 3 — материализовать вход по Pass фестиваля (см. комментарий у
  // findFestivalPassForEvent в ticket-service.ts). Ничего не платится
  // повторно — Pass уже оплачен на событии фестиваля.
  async function useFestivalPass() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/events/${eventSlug}/registrations/${registrationId}/festival-pass`, { method: "POST" });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.message || data.error || "Не удалось применить Pass фестиваля.");
      return;
    }
    router.refresh();
  }

  // "Простой" случай (0 или 1 билет) — если билета ещё нет, бьём в
  // registration-эндпоинт (лениво заводит passless/typeless Ticket); если
  // есть — сразу в ticket-эндпоинт по его id.
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

  // TicketCheckIn (Commerce Engine v1, 2026-09-17) — отметка явки по билету,
  // независимая от оплаты. Тумблер: клик отмечает явку (POST), повторный клик
  // отменяет ошибочную отметку (DELETE) — тот же принцип "клик переключает",
  // что и у toggleOne/toggleSimple выше.
  async function toggleCheckIn(ticketId: string, nextCheckedIn: boolean) {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/events/${eventSlug}/tickets/${ticketId}/check-in`, {
      method: nextCheckedIn ? "POST" : "DELETE",
      headers: nextCheckedIn ? { "Content-Type": "application/json" } : undefined,
      body: nextCheckedIn ? JSON.stringify({ method: "MANUAL" }) : undefined,
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.message || data.error || "Не удалось изменить отметку явки.");
      return;
    }
    router.refresh();
  }

  function CheckInToggle({ ticket }: { ticket: TicketPaymentInfo }) {
    return (
      <button
        type="button"
        disabled={loading}
        onClick={() => toggleCheckIn(ticket.id, !ticket.checkedIn)}
        className="disabled:cursor-not-allowed disabled:opacity-50"
      >
        <StatusBadge label={ticket.checkedIn ? "Явка ✓" : "Не пришёл"} variant={ticket.checkedIn ? "success" : "neutral"} />
      </button>
    );
  }

  function ticketLabel(t: TicketPaymentInfo): string {
    return t.passName ?? t.ticketTypeName ?? "Входной билет";
  }

  // Пикер "Использовать Pass фестиваля" — отдельная кнопка, не смешивается с
  // обычным пикером Pass этого события (это ЧУЖОЙ Pass, купленный на
  // фестивале, не Pass самого этого события).
  const festivalPassButton = festivalPassMatch && !hasFestivalPassEntry && (
    <button
      type="button"
      disabled={loading}
      onClick={useFestivalPass}
      className="text-xs text-admin-primaryHover hover:underline disabled:cursor-not-allowed disabled:opacity-50"
    >
      Использовать Pass фестиваля «{festivalPassMatch.passName}»
    </button>
  );

  if (!hasPassCatalog && !hasTicketTypeCatalog) {
    const isPaid = tickets[0]?.isPaid ?? false;
    return (
      <span className="inline-flex flex-col items-start gap-1">
        <button
          type="button"
          disabled={loading}
          onClick={() => toggleSimple(tickets[0], !isPaid)}
          className="disabled:cursor-not-allowed disabled:opacity-50"
        >
          <StatusBadge label={isPaid ? "Оплачено" : "Не оплачено"} variant={isPaid ? "success" : "danger"} />
        </button>
        {tickets[0] && <CheckInToggle ticket={tickets[0]} />}
        {festivalPassButton}
        {error && <span className="text-xs text-red-400">{error}</span>}
      </span>
    );
  }

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

  const issueTicketTypePicker = availableTicketTypesToIssue.length > 0 && (
    <span className="inline-flex flex-col items-start gap-1">
      <select
        value={effectiveTicketTypeId}
        onChange={(e) => setSelectedTicketTypeId(e.target.value)}
        disabled={loading}
        className="rounded-app-sm border border-admin-border bg-admin-card2 px-1.5 py-0.5 text-xs text-night-text"
      >
        {availableTicketTypesToIssue.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={loading}
        onClick={issueTicketType}
        className="text-xs text-admin-primaryHover hover:underline disabled:cursor-not-allowed disabled:opacity-50"
      >
        Выдать билет
      </button>
    </span>
  );

  if (tickets.length === 0) {
    return (
      <span className="inline-flex flex-col items-start gap-1">
        {issuePicker || issueTicketTypePicker || <span className="text-sm text-admin-muted">—</span>}
        {festivalPassButton}
        {error && <span className="text-xs text-red-400">{error}</span>}
      </span>
    );
  }

  if (tickets.length === 1) {
    const t = tickets[0];
    return (
      <span className="inline-flex flex-col items-start gap-1">
        <span className="text-xs text-admin-muted">{ticketLabel(t)}</span>
        <button
          type="button"
          disabled={loading}
          onClick={() => toggleOne(t.id, !t.isPaid)}
          className="disabled:cursor-not-allowed disabled:opacity-50"
        >
          <StatusBadge label={t.isPaid ? "Оплачено" : "Не оплачено"} variant={t.isPaid ? "success" : "danger"} />
        </button>
        <CheckInToggle ticket={t} />
        {issuePicker}
        {issueTicketTypePicker}
        {festivalPassButton}
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
          <span className="max-w-[220px] truncate text-xs text-admin-muted">{tickets.map(ticketLabel).join(", ")}</span>
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
                  <span className="truncate text-sm font-semibold text-night-text">{ticketLabel(t)}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => toggleOne(t.id, !t.isPaid)}
                      className="disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <StatusBadge label={t.isPaid ? "Оплачено" : "Не оплачено"} variant={t.isPaid ? "success" : "danger"} />
                    </button>
                    <CheckInToggle ticket={t} />
                  </span>
                </div>
              ))}
            </div>
            {(issuePicker || issueTicketTypePicker || festivalPassButton) && (
              <div className="flex flex-col gap-2 border-t border-admin-border px-5 py-3">
                {issuePicker}
                {issueTicketTypePicker}
                {festivalPassButton}
              </div>
            )}
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
