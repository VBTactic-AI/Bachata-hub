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
  // Commerce Engine v1 (2026-09-18) — снимок фактической суммы (price — уже
  // ПОСЛЕ скидки) и суммы скидки (discountAmount), если билет выдан по
  // промокоду. "Было" для зачёркнутой цены = price + discountAmount.
  price: number | null;
  currency: string | null;
  discountAmount: number | null;
};
export type AssignablePassOption = { id: string; name: string; price: number | null; currency: string | null };
export type AssignableTicketTypeOption = { id: string; name: string; price: number | null; currency: string | null };
export type AssignablePromoCodeOption = {
  id: string;
  code: string;
  discountType: "PERCENT" | "FIXED_AMOUNT";
  discountValue: number;
  passIds: string[]; // пусто — применим к любому Pass события
  ticketTypeIds: string[]; // пусто — применим к любому TicketType события (2026-09-18)
};
export type FestivalPassMatch = { passId: string; passName: string };

function formatMoney(price: number | null, currency: string | null): string {
  return price == null ? "Бесплатно" : `${price} ${currency ?? ""}`.trim();
}

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
// Независимо от ветки, ДОПОЛНИТЕЛЬНО рендерится единый пикер "Выдать" (см.
// issuePicker ниже — один <select> сразу со всеми доступными Pass и
// TicketType, одна кнопка, а не два параллельных пикера с отдельными
// кнопками, см. 2026-09-18), если есть хотя бы один вариант, который танцор
// ещё не получал — раньше пикер показывался ТОЛЬКО при полном отсутствии
// билетов, из-за чего танцор с уже существующим passless-билетом (заведённым
// до появления каталога на событии) навсегда терял возможность получить Pass
// через этот экран (найдено вживую пользователем 2026-09-16: "есть Pass, но
// в участниках я его не вижу"). После того как танцор получил один билет —
// пикер скрывается (Commerce Engine v1: максимум один билет допуска на
// событие, второй сервер не выдаст).
export function TicketPaymentCell({
  eventSlug,
  registrationId,
  dancerId,
  hasPassCatalog,
  hasTicketTypeCatalog,
  initialTickets,
  assignablePasses,
  assignableTicketTypes,
  assignablePromoCodes,
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
  // Действующие промокоды события (2026-09-18) — организатор выбирает из
  // списка, не вводит руками (см. комментарий у listActivePromoCodesForEvent
  // в pass-service.ts — "это для клиентов, для админа просто выбор того, что
  // сказал танцор"). Применимость к конкретному Pass/TicketType фильтруется
  // на клиенте по passIds/ticketTypeIds (оба пусты = применим к любому).
  assignablePromoCodes: AssignablePromoCodeOption[];
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
  // Commerce Engine v1 (2026-09-18, по прямому запросу пользователя) — ОДИН
  // выбор вместо двух параллельных пикеров (Pass/TicketType раньше выдавались
  // через два независимых <select>+кнопка, из-за чего организатор не видел
  // оба варианта сразу и путался, какую кнопку жать). selectedOption — ключ
  // вида "pass:ID" / "tickettype:ID" по обеим таблицам сразу.
  const [selectedOption, setSelectedOption] = useState("");
  // Промокод — выбор из списка (id промокода), а не ручной ввод: "это для
  // клиентов, для админа — просто выбор того, что сказал танцор" (прямые
  // слова пользователя, 2026-09-18). Применяется и к Pass, и к TicketType
  // (PromoCodePass/PromoCodeTicketType — промокод независим от типа
  // продукта, по прямому запросу пользователя того же дня).
  const [selectedPromoCodeId, setSelectedPromoCodeId] = useState("");
  // Способ расчёта (2026-09-18) — наличные/безнал, по умолчанию "Наличные"
  // (самый частый случай на входе на вечеринку).
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "TRANSFER">("CASH");

  // Pass/TicketType, которые этот танцор ещё не получал — сравниваем с уже
  // имеющимися билетами (см. комментарий у функции выше про регрессию).
  const ownedPassIds = new Set(tickets.map((t) => t.passId).filter((id): id is string => id != null));
  const ownedTicketTypeIds = new Set(tickets.map((t) => t.ticketTypeId).filter((id): id is string => id != null));
  const availableToIssue = assignablePasses.filter((p) => !ownedPassIds.has(p.id));
  const availableTicketTypesToIssue = assignableTicketTypes.filter((t) => !ownedTicketTypeIds.has(t.id));

  type IssueOption = { key: string; kind: "pass" | "tickettype"; id: string; name: string; price: number | null; currency: string | null };
  const issueOptions: IssueOption[] = [
    ...availableToIssue.map((p) => ({ key: `pass:${p.id}`, kind: "pass" as const, id: p.id, name: p.name, price: p.price, currency: p.currency })),
    ...availableTicketTypesToIssue.map((t) => ({
      key: `tickettype:${t.id}`,
      kind: "tickettype" as const,
      id: t.id,
      name: t.name,
      price: t.price,
      currency: t.currency,
    })),
  ];
  // НЕ полагаться на selectedOption как на единственный источник истины (тот
  // же класс бага, что и с initialTickets/useState выше) — если сохранённый
  // выбор больше не входит в актуальный список, тихо откатываемся на первый
  // доступный вариант.
  const effectiveOption = issueOptions.find((o) => o.key === selectedOption) ?? issueOptions[0] ?? null;
  // Промокоды, применимые к ВЫБРАННОМУ прямо сейчас товару — если у кода
  // вообще нет привязок (ни к Pass, ни к TicketType), он применим к любому
  // товару события; если привязки есть — только к явно перечисленным (см.
  // isPromoCodeApplicableToProduct в ticket-service.ts, та же логика
  // продублирована здесь для мгновенного фильтра в UI).
  const applicablePromoCodes = assignablePromoCodes.filter((c) => {
    const hasAnyRestriction = c.passIds.length > 0 || c.ticketTypeIds.length > 0;
    if (!hasAnyRestriction) return true;
    if (!effectiveOption) return false;
    return effectiveOption.kind === "pass" ? c.passIds.includes(effectiveOption.id) : c.ticketTypeIds.includes(effectiveOption.id);
  });
  const effectivePromoCode = applicablePromoCodes.find((c) => c.id === selectedPromoCodeId) ?? null;
  const hasFestivalPassEntry = festivalPassMatch != null && tickets.some((t) => t.passId === festivalPassMatch.passId);

  function promoCodeLabel(c: AssignablePromoCodeOption): string {
    const discount = c.discountType === "PERCENT" ? `-${c.discountValue}%` : `-${c.discountValue}`;
    return `${c.code} (${discount})`;
  }

  // Выдать танцору выбранный товар — Pass или TicketType, определяется по
  // effectiveOption.kind (2026-09-16, по прямому запросу пользователя —
  // иначе на событии с Pass в принципе не появлялось ни одного Ticket с
  // passId, из-за чего "Продано"/"Выручка" на вкладке "Билеты" оставались 0
  // навсегда). Сразу отмечаем оплаченным — организатор уже получил деньги в
  // момент выдачи; если это не так, оплату можно снять сразу после через
  // обычный тумблер этой же ячейки.
  async function issueSelected() {
    if (!effectiveOption) return;
    setLoading(true);
    setError(null);
    const url =
      effectiveOption.kind === "pass"
        ? `/api/events/${eventSlug}/passes/${effectiveOption.id}/tickets`
        : `/api/events/${eventSlug}/ticket-types/${effectiveOption.id}/tickets`;
    const body = { dancerId, markPaid: true, promoCode: effectivePromoCode?.code, paymentMethod };
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.message || data.error || "Не удалось выдать билет.");
      return;
    }
    setSelectedPromoCodeId("");
    setOpen(false);
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

  // Возврат оплаты (2026-09-18, по прямому запросу пользователя — "Как можно
  // вернуть оплату?") — в отличие от toggleOne (просто снимает флажок
  // isPaid), бьёт в уже существующий refundTicket() (ticket-service.ts):
  // создаёт запись Refund, переводит Order/UserPass в REFUNDED/REVOKED и
  // освобождает место допуска на событие — билет пропадёт из этого списка
  // (listTicketsByDancerForEvent отдаёт только status: "ISSUED"), пикер
  // "Выдать" появится снова.
  async function refundOne(ticketId: string) {
    if (!window.confirm("Вернуть оплату за этот билет? Билет будет отменён, место на событие освободится.")) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/events/${eventSlug}/tickets/${ticketId}/refund`, { method: "POST" });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.message || data.error || "Не удалось вернуть оплату.");
      return;
    }
    router.refresh();
  }

  // TicketCheckIn-тумблер здесь убран (2026-09-18, по прямому решению
  // пользователя): раз на событие теперь максимум один билет допуска
  // (Commerce Engine v1, assertSingleAdmissionPerEvent), явка по билету и
  // явка на само событие (колонка "CHECK-IN" в таблице участников,
  // EventRegistration.checkedInAt) стали одним и тем же фактом — держать
  // оба было бы дублированием. Backend (ticket-checkin-service.ts, роут
  // .../tickets/[id]/check-in) не удалён — точка расширения на случай, если
  // понадобится (например, отдельный QR-сканер на входе).

  function ticketLabel(t: TicketPaymentInfo): string {
    return t.passName ?? t.ticketTypeName ?? "Входной билет";
  }

  // Commerce Engine v1 (2026-09-18) — название + сумма, зачёркнутая исходная
  // цена при скидке по промокоду ("15 ~~перечёркнуто~~ 13", по прямому
  // запросу пользователя, чтобы было наглядно видно применённый промокод).
  // В одну строку (2026-09-19, по прямому запросу пользователя — раньше
  // название и цена стояли друг под другом, из-за чего строка участника
  // становилась заметно выше остальных).
  function TicketPriceLabel({ t, nameClassName }: { t: TicketPaymentInfo; nameClassName: string }) {
    const hasDiscount = t.price != null && t.discountAmount != null && t.discountAmount > 0;
    const original = hasDiscount ? t.price! + t.discountAmount! : null;
    return (
      <span className="flex flex-wrap items-baseline gap-x-1.5">
        <span className={nameClassName}>{ticketLabel(t)}</span>
        <span className="text-xs text-admin-muted">
          {original != null && <span className="mr-1 text-admin-disabled line-through">{formatMoney(original, t.currency)}</span>}
          {formatMoney(t.price, t.currency)}
        </span>
      </span>
    );
  }

  // Единая кнопка "Выдать билет"/"Вернуть билет" (2026-09-18, по прямому
  // запросу пользователя — раньше это были ДВЕ отдельные вещи: кликабельный
  // StatusBadge "Оплачено"/"Не оплачено" (toggleOne — просто флажок isPaid) и
  // отдельная текстовая ссылка "Вернуть оплату" рядом (refundOne — настоящий
  // возврат с Refund/аудитом, см. комментарий у refundOne выше). Теперь это
  // ОДНА кнопка того же кликабельного-StatusBadge стиля, что и везде в
  // проекте (EventRegistrationCheckInToggle, CheckInToggle): неоплаченный
  // билет — "Выдать билет" (клик = toggleOne/toggleSimple, отмечает
  // оплаченным); оплаченный — "Вернуть билет" (клик = refundOne, тот же
  // настоящий возврат с подтверждением, что и раньше — семантика не
  // изменилась, изменилось только то, что это теперь одна кнопка вместо
  // двух).
  function PaymentToggleButton({ isPaid, onIssue, onRefund }: { isPaid: boolean; onIssue: () => void; onRefund: () => void }) {
    return (
      <button
        type="button"
        disabled={loading}
        onClick={isPaid ? onRefund : onIssue}
        className="disabled:cursor-not-allowed disabled:opacity-50"
      >
        <StatusBadge label={isPaid ? "Вернуть билет" : "Выдать билет"} variant={isPaid ? "success" : "danger"} />
      </button>
    );
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
    const soleTicket = tickets[0];
    const isPaid = soleTicket?.isPaid ?? false;
    return (
      <span className="inline-flex flex-col items-start gap-1">
        <PaymentToggleButton
          isPaid={isPaid}
          onIssue={() => toggleSimple(soleTicket, true)}
          onRefund={() => soleTicket && refundOne(soleTicket.id)}
        />
        {festivalPassButton}
        {error && <span className="text-xs text-red-400">{error}</span>}
      </span>
    );
  }

  // Форма выдачи билета (2026-09-18, по прямому запросу пользователя — раньше
  // весь этот блок (пикер товара + промокод + способ оплаты + кнопка) всегда
  // разворачивался ПРЯМО В ЯЧЕЙКЕ таблицы для любого ещё не получившего
  // билет участника — одна такая строка становилась заметно выше и "богаче"
  // остальных, ломая визуальный ритм таблицы. Теперь это содержимое модалки
  // (см. кнопку-триггер "Выдать билет" в ветке tickets.length === 0 ниже) —
  // тот же приём, что уже применялся к списку из нескольких билетов дальше в
  // файле, просто теперь единообразно для любого количества билетов.
  const issueForm = issueOptions.length > 0 && (
    <div className="flex flex-col gap-3 px-5 py-4">
      {issueOptions.length === 1 ? (
        <p className="m-0 text-sm font-semibold text-night-text">
          {issueOptions[0].name} — {formatMoney(issueOptions[0].price, issueOptions[0].currency)}
        </p>
      ) : (
        <label className="flex flex-col gap-1 text-xs text-admin-muted">
          Что выдать
          <select
            value={effectiveOption?.key ?? ""}
            onChange={(e) => setSelectedOption(e.target.value)}
            disabled={loading}
            className="rounded-app-sm border border-admin-border bg-admin-card2 px-2 py-1.5 text-sm text-night-text"
          >
            {availableToIssue.length > 0 && (
              <optgroup label="Pass">
                {availableToIssue.map((p) => (
                  <option key={`pass:${p.id}`} value={`pass:${p.id}`}>
                    {p.name} — {formatMoney(p.price, p.currency)}
                  </option>
                ))}
              </optgroup>
            )}
            {availableTicketTypesToIssue.length > 0 && (
              <optgroup label="Билет">
                {availableTicketTypesToIssue.map((t) => (
                  <option key={`tickettype:${t.id}`} value={`tickettype:${t.id}`}>
                    {t.name} — {formatMoney(t.price, t.currency)}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
      )}
      {applicablePromoCodes.length > 0 && (
        <label className="flex flex-col gap-1 text-xs text-admin-muted">
          Промокод
          <select
            value={selectedPromoCodeId}
            onChange={(e) => setSelectedPromoCodeId(e.target.value)}
            disabled={loading}
            className="rounded-app-sm border border-admin-border bg-admin-card2 px-2 py-1.5 text-sm text-night-text"
          >
            <option value="">Без промокода</option>
            {applicablePromoCodes.map((c) => (
              <option key={c.id} value={c.id}>
                {promoCodeLabel(c)}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="flex flex-col gap-1 text-xs text-admin-muted">
        Способ оплаты
        <select
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value as "CASH" | "TRANSFER")}
          disabled={loading}
          className="rounded-app-sm border border-admin-border bg-admin-card2 px-2 py-1.5 text-sm text-night-text"
        >
          <option value="CASH">Наличные</option>
          <option value="TRANSFER">Б/н (перевод)</option>
        </select>
      </label>
      <Button type="button" disabled={loading} onClick={issueSelected} className="border-none bg-gradient-admin-cta">
        {loading ? "…" : "Выдать"}
      </Button>
    </div>
  );

  if (tickets.length === 0) {
    return (
      <span className="inline-flex flex-col items-start gap-1">
        {issueOptions.length > 0 ? (
          <button type="button" disabled={loading} onClick={() => setOpen(true)} className="disabled:cursor-not-allowed disabled:opacity-50">
            <StatusBadge label="Выдать билет" variant="danger" />
          </button>
        ) : (
          <span className="text-sm text-admin-muted">—</span>
        )}
        {festivalPassButton}
        {!open && error && <span className="text-xs text-red-400">{error}</span>}

        {open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5" onClick={() => setOpen(false)} role="presentation">
            <div
              className="flex w-full max-w-[380px] flex-col overflow-hidden rounded-app border border-admin-border bg-admin-card shadow-2xl"
              role="dialog"
              aria-modal="true"
              aria-labelledby="issue-ticket-title"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="border-b border-admin-border px-5 py-4">
                <h3 id="issue-ticket-title" className="m-0 text-[17px] font-extrabold text-night-text">
                  Выдать билет
                </h3>
              </div>
              {issueForm}
              {error && <p className="m-0 px-5 pb-3 text-xs text-red-400">{error}</p>}
              <div className="flex items-center justify-end gap-2 border-t border-admin-border px-5 py-4">
                <Button type="button" size="sm" variant="ghost" className="text-admin-muted hover:text-admin-primaryHover" onClick={() => setOpen(false)}>
                  Отмена
                </Button>
              </div>
            </div>
          </div>
        )}
      </span>
    );
  }

  if (tickets.length === 1) {
    const t = tickets[0];
    // Commerce Engine v1 (2026-09-18) — у танцора уже есть один билет
    // допуска на ЭТО событие, второй сервер всё равно не выдаст
    // (already_has_admission, см. ticket-service.ts) — пикер на ещё один
    // билет здесь просто не рендерится (issuePicker не используется в этой
    // ветке). Поясняющая подпись про "второй билет не выдаётся" убрана
    // (2026-09-18, по прямому запросу пользователя) — сама единая кнопка
    // ниже уже однозначно показывает, что можно сделать с ЭТИМ билетом.
    return (
      <span className="inline-flex flex-col items-start gap-1">
        <TicketPriceLabel t={t} nameClassName="text-xs text-admin-muted" />
        <PaymentToggleButton isPaid={t.isPaid} onIssue={() => toggleOne(t.id, true)} onRefund={() => refundOne(t.id)} />
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
                  <TicketPriceLabel t={t} nameClassName="truncate text-sm font-semibold text-night-text" />
                  <span className="shrink-0">
                    <PaymentToggleButton isPaid={t.isPaid} onIssue={() => toggleOne(t.id, true)} onRefund={() => refundOne(t.id)} />
                  </span>
                </div>
              ))}
            </div>
            {/* Commerce Engine v1 — у танцора уже больше одного билета на
                событие (сюда попадают только легаси-случаи до введения
                правила "один билет на событие", см. tickets.length === 1
                выше) — пикеры на ЕЩЁ один билет не показываем, третий сервер
                тоже не выдаст. */}
            {festivalPassButton && <div className="flex flex-col gap-2 border-t border-admin-border px-5 py-3">{festivalPassButton}</div>}
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
