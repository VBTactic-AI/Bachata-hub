"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Select, Textarea, Label } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { DateTimeField } from "@/components/ui/DateTimeField";

const PASS_TYPE_LABELS: Record<string, string> = {
  FULL_PASS: "Full Pass",
  PARTY_PASS: "Party Pass",
  WORKSHOP_PASS: "Workshop Pass",
  DAY_PASS: "Day Pass",
  COMPETITION_PASS: "Competition Pass",
  VIP_PASS: "VIP Pass",
  FREE_PASS: "Free Pass",
  CUSTOM: "Другое",
};

const FIELD_CLASS = "border-admin-border bg-admin-card2 text-night-text focus:border-admin-primary focus:ring-admin-primary/20";

export type PassTemplateOption = {
  id: string;
  name: string;
  description: string | null;
  type: string;
  price: number | null;
  currency: string | null;
  quantity: number | null;
  imageUrl: string | null;
  allowMultipleEntry: boolean;
};

export type AccessTargetOption = { id: string; label: string; kind: "programItem" | "masterclassSession" };

// salesStartAt/salesEndAt/validFrom/validUntil/refundPolicy/refundDeadline/
// refundFeePercent — необязательны (2026-09-18): у шаблона (scope="template",
// см. комментарий у PassFormModal ниже) этих данных физически нет, initial
// для него собирается из EventTemplatePass/PassTemplate, у которых этих
// полей нет вовсе. id тоже необязателен — у шаблонной строки в локальном
// массиве id нет (используется только для API-запросов реального Pass).
export type PassFormValue = {
  id?: string;
  name: string;
  description: string | null;
  type: string;
  price: number | null;
  currency: string | null;
  quantity: number | null;
  salesStartAt?: string | null;
  salesEndAt?: string | null;
  validFrom?: string | null;
  validUntil?: string | null;
  imageUrl: string | null;
  allowMultipleEntry: boolean;
  refundPolicy?: string;
  refundDeadline?: string | null;
  refundFeePercent?: number | null;
};

// Общая (применимая везде, включая шаблоны) форма Pass — то, что реально
// передаётся наружу через onSubmit в scope="template".
export type PassCommonFormValues = {
  name: string;
  description: string | null;
  type: string;
  price: number | null;
  currency: string | null;
  quantity: number | null;
  imageUrl: string | null;
  allowMultipleEntry: boolean;
};

const REFUND_POLICY_LABELS: Record<string, string> = {
  NONE: "Без возврата",
  UNTIL_DATE: "Возврат до даты",
  PARTIAL: "Частичный возврат (с комиссией)",
  FULL: "Полный возврат в любой момент",
};

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  // Отбрасываем секунды/зону — DateTimeField работает со строкой "YYYY-MM-DDTHH:mm".
  return iso.slice(0, 16);
}

function formatShortDate(localInput: string): string {
  const [datePart] = localInput.split("T");
  if (!datePart) return "";
  const [year, month, day] = datePart.split("-");
  return `${day}.${month}.${year}`;
}

type TierForm = { id?: string; label: string; price: string; currency: string; validFrom: string; validUntil: string };

// Попап одного ценового периода (Early Bird/Regular/Late — 2026-09-19, по
// прямому запросу пользователя: "можно как-то сделать возможность создавать
// множество Early Bird" — backend уже поддерживал произвольное число тиров
// (PassPriceTier), ограничение было только в UI, где помещался ровно один).
// Вложен внутрь основного попапа Pass — z-[60], выше основного z-50.
function PriceTierFormModal({
  initial,
  defaultCurrency,
  onSave,
  onClose,
}: {
  initial: TierForm | null;
  defaultCurrency: string;
  onSave: (form: TierForm) => void;
  onClose: () => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [price, setPrice] = useState(initial?.price ?? "");
  const [currency, setCurrency] = useState(initial?.currency || defaultCurrency);
  const [validFrom, setValidFrom] = useState(initial?.validFrom ?? "");
  const [validUntil, setValidUntil] = useState(initial?.validUntil ?? "");
  const [error, setError] = useState<string | null>(null);

  function save() {
    if (!label.trim()) {
      setError("Название периода обязательно.");
      return;
    }
    if (!price) {
      setError("Цена обязательна.");
      return;
    }
    onSave({ id: initial?.id, label: label.trim(), price, currency, validFrom, validUntil });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-5" onClick={onClose} role="presentation">
      <div
        className="flex max-h-[90vh] w-full max-w-[400px] flex-col overflow-hidden rounded-app border border-admin-border bg-admin-card shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="price-tier-form-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-admin-border px-5 py-4">
          <h3 id="price-tier-form-title" className="m-0 text-[17px] font-extrabold text-night-text">
            {initial ? "Изменить период" : "Новый ценовой период"}
          </h3>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="flex flex-col gap-3">
            <Label className="text-admin-muted">
              Название
              <Input value={label} onChange={(e) => setLabel(e.target.value)} className={FIELD_CLASS} placeholder="Early Bird" />
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <Label className="text-admin-muted">
                Цена
                <Input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className={FIELD_CLASS} />
              </Label>
              <Label className="text-admin-muted">
                Валюта
                <Input value={currency} onChange={(e) => setCurrency(e.target.value)} className={FIELD_CLASS} />
              </Label>
            </div>
            <Label className="text-admin-muted">
              Действует с (необязательно)
              <DateTimeField value={validFrom} onChange={setValidFrom} className={FIELD_CLASS} />
            </Label>
            <Label className="text-admin-muted">
              Действует до (необязательно)
              <DateTimeField value={validUntil} onChange={setValidUntil} className={FIELD_CLASS} />
            </Label>
            {error && <p className="m-0 text-sm text-red-400">{error}</p>}
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-admin-border px-5 py-4">
          <Button type="button" size="sm" variant="ghost" className="text-admin-muted hover:text-admin-primaryHover" onClick={onClose}>
            Отмена
          </Button>
          <Button type="button" size="sm" variant="admin" onClick={save}>
            Сохранить
          </Button>
        </div>
      </div>
    </div>
  );
}

// Создание/редактирование Pass (2026-09-16) — одна модалка на оба режима.
// Секции: основное, цена (+ произвольное число ценовых периодов —
// Early Bird/Regular/Late, см. PriceTierFormModal выше), количество/период
// продаж, доступ к пунктам программы/сессиям (только если у события они
// есть), обложка, повторный вход. "Начать из шаблона" — только в режиме
// создания.
//
// scope="template" (2026-09-18, по прямому запросу пользователя — "везде
// один и тот же экран") — этот же компонент переиспользован в
// EventTemplateEditor.tsx ("Добавить Pass") и PassTemplateManager.tsx
// ("Шаблоны Pass"): скрывает секции, которых у шаблона физически не может
// быть (даты продаж/действия, условия возврата, Early Bird, доступ к
// программе — привязаны к конкретной дате конкретного события, у шаблона
// её ещё нет), и вместо fetch на events API вызывает переданный onSubmit с
// только применимыми полями (PassCommonFormValues) — сохранение решает
// вызывающий код (локальный state шаблона события или свой API-роут
// PassTemplate).
export function PassFormModal({
  eventSlug,
  mode,
  initial,
  templates = [],
  accessOptions = [],
  initialAccessTargetIds,
  onClose,
  scope = "event",
  onSubmit,
}: {
  eventSlug?: string;
  mode: "create" | "edit";
  initial?: PassFormValue;
  templates?: PassTemplateOption[];
  accessOptions?: AccessTargetOption[];
  initialAccessTargetIds?: string[];
  onClose: () => void;
  scope?: "event" | "template";
  onSubmit?: (values: PassCommonFormValues) => void | Promise<void>;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [type, setType] = useState(initial?.type ?? "FULL_PASS");
  const [isFree, setIsFree] = useState(initial ? initial.price == null : false);
  const [price, setPrice] = useState(initial?.price != null ? String(initial.price) : "");
  const [currency, setCurrency] = useState(initial?.currency ?? "BYN");
  const [unlimited, setUnlimited] = useState(initial ? initial.quantity == null : true);
  const [quantity, setQuantity] = useState(initial?.quantity != null ? String(initial.quantity) : "");
  // Без ограничений по времени продажи (2026-09-18, по прямому запросу
  // пользователя) — блок из 4 дат раньше был виден всегда, даже когда
  // организатору вообще не нужны временные рамки (самый частый случай).
  // По умолчанию true, если ни одна из 4 дат ещё не задана — при
  // редактировании Pass, у которого хоть одна дата уже стоит, чекбокс сразу
  // снят и блок открыт, чтобы существующие значения не терялись из виду.
  const [noSalesWindow, setNoSalesWindow] = useState(
    !(initial?.salesStartAt || initial?.salesEndAt || initial?.validFrom || initial?.validUntil)
  );
  const [salesStartAt, setSalesStartAt] = useState(toLocalInput(initial?.salesStartAt ?? null));
  const [salesEndAt, setSalesEndAt] = useState(toLocalInput(initial?.salesEndAt ?? null));
  const [validFrom, setValidFrom] = useState(toLocalInput(initial?.validFrom ?? null));
  const [validUntil, setValidUntil] = useState(toLocalInput(initial?.validUntil ?? null));
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? "");
  const [allowMultipleEntry, setAllowMultipleEntry] = useState(initial?.allowMultipleEntry ?? true);
  const [refundPolicy, setRefundPolicy] = useState(initial?.refundPolicy ?? "NONE");
  const [refundDeadline, setRefundDeadline] = useState(toLocalInput(initial?.refundDeadline ?? null));
  const [refundFeePercent, setRefundFeePercent] = useState(initial?.refundFeePercent != null ? String(initial.refundFeePercent) : "");
  const [tiers, setTiers] = useState<TierForm[]>([]);
  const [initialTierIds, setInitialTierIds] = useState<string[]>([]);
  const [editingTier, setEditingTier] = useState<number | "new" | null>(null);
  const [selectedTargets, setSelectedTargets] = useState<string[]>(initialAccessTargetIds ?? []);
  const [templateId, setTemplateId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Редактирование — подтягиваем ВСЕ уже существующие ценовые периоды
  // (2026-09-19, раньше — только первый). Только для scope="event" — у
  // шаблона периодов не бывает вовсе.
  useEffect(() => {
    if (scope !== "event" || mode !== "edit" || !initial) return;
    fetch(`/api/events/${eventSlug}/passes/${initial.id}/price-tiers`)
      .then((r) => r.json())
      .then((data: { tiers?: { id: string; label: string; price: number | string; currency: string | null; validFrom: string | null; validUntil: string | null }[] }) => {
        const loaded: TierForm[] = (data.tiers ?? []).map((t) => ({
          id: t.id,
          label: t.label,
          price: String(t.price),
          currency: t.currency ?? "",
          validFrom: toLocalInput(t.validFrom),
          validUntil: toLocalInput(t.validUntil),
        }));
        setTiers(loaded);
        setInitialTierIds(loaded.map((t) => t.id!));
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, initial?.id]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function applyTemplate(id: string) {
    setTemplateId(id);
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    setName(tpl.name);
    setDescription(tpl.description ?? "");
    setType(tpl.type);
    setIsFree(tpl.price == null);
    setPrice(tpl.price != null ? String(tpl.price) : "");
    setCurrency(tpl.currency ?? "BYN");
    setUnlimited(tpl.quantity == null);
    setQuantity(tpl.quantity != null ? String(tpl.quantity) : "");
    setImageUrl(tpl.imageUrl ?? "");
    setAllowMultipleEntry(tpl.allowMultipleEntry);
  }

  function toggleTarget(id: string) {
    setSelectedTargets((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function submit() {
    if (!name.trim()) {
      setError("Название обязательно.");
      return;
    }
    setLoading(true);
    setError(null);

    const commonBody: PassCommonFormValues = {
      name: name.trim(),
      description: description.trim() || null,
      type,
      price: isFree ? null : price ? Number(price) : null,
      currency: isFree ? null : currency || null,
      quantity: unlimited ? null : quantity ? Number(quantity) : null,
      imageUrl: imageUrl.trim() || null,
      allowMultipleEntry,
    };

    // scope="template" — сохранение решает вызывающий код (локальный state
    // шаблона события/свой API-роут PassTemplate), никакого fetch на events
    // API здесь не происходит (даты продаж/возврат/Early Bird/доступ к
    // программе у шаблона нет — см. комментарий у PassFormModal выше).
    // onSubmit может бросить Error (например, PassTemplateManager делает
    // реальный fetch на /api/pass-templates) — модалка не закрывается и
    // показывает сообщение, тем же способом, что и обычный event-путь ниже.
    if (onSubmit) {
      try {
        await onSubmit(commonBody);
        setLoading(false);
        onClose();
      } catch (e) {
        setLoading(false);
        setError(e instanceof Error ? e.message : "Не удалось сохранить.");
      }
      return;
    }

    const passBody = {
      ...commonBody,
      salesStartAt: !noSalesWindow && salesStartAt ? new Date(salesStartAt).toISOString() : null,
      salesEndAt: !noSalesWindow && salesEndAt ? new Date(salesEndAt).toISOString() : null,
      validFrom: !noSalesWindow && validFrom ? new Date(validFrom).toISOString() : null,
      validUntil: !noSalesWindow && validUntil ? new Date(validUntil).toISOString() : null,
      refundPolicy,
      refundDeadline: refundPolicy === "UNTIL_DATE" && refundDeadline ? new Date(refundDeadline).toISOString() : null,
      refundFeePercent: refundPolicy === "PARTIAL" && refundFeePercent ? Number(refundFeePercent) : null,
    };

    const url = mode === "create" ? `/api/events/${eventSlug}/passes` : `/api/events/${eventSlug}/passes/${initial!.id}`;
    const res = await fetch(url, {
      method: mode === "create" ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(passBody),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setLoading(false);
      setError(data.message || data.error || "Не удалось сохранить Pass.");
      return;
    }
    const passId: string = mode === "create" ? data.pass.id : initial!.id;

    // Ценовые периоды (2026-09-19) — diff применяется здесь: убранные из
    // списка тиры удаляются, новые (без id, добавленные через
    // PriceTierFormModal) создаются, изменённые — обновляются. Каждый тир
    // хранит свою собственную валюту (не обязательно совпадает с основной
    // ценой Pass — организатор мог сменить валюту периода отдельно).
    const currentTierIds = tiers.filter((t) => t.id).map((t) => t.id!);
    for (const removedId of initialTierIds.filter((id) => !currentTierIds.includes(id))) {
      await fetch(`/api/events/${eventSlug}/passes/${passId}/price-tiers/${removedId}`, { method: "DELETE" });
    }
    for (const t of tiers) {
      const tierBody = {
        label: t.label,
        price: Number(t.price),
        currency: t.currency || null,
        validFrom: t.validFrom ? new Date(t.validFrom).toISOString() : null,
        validUntil: t.validUntil ? new Date(t.validUntil).toISOString() : null,
      };
      if (t.id) {
        await fetch(`/api/events/${eventSlug}/passes/${passId}/price-tiers/${t.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(tierBody),
        });
      } else {
        await fetch(`/api/events/${eventSlug}/passes/${passId}/price-tiers`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(tierBody),
        });
      }
    }

    // Доступ к пунктам программы/сессиям — полная замена (пусто = без ограничений).
    if (accessOptions.length > 0) {
      const targets = selectedTargets.map((id) => {
        const opt = accessOptions.find((o) => o.id === id)!;
        return opt.kind === "programItem" ? { programItemId: opt.id } : { masterclassSessionId: opt.id };
      });
      await fetch(`/api/events/${eventSlug}/passes/${passId}/access-grants`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targets }),
      });
    }

    setLoading(false);
    onClose();
    router.refresh();
  }

  async function saveAsTemplate() {
    if (mode !== "edit" || !initial) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/events/${eventSlug}/passes/${initial.id}/save-as-template`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.message || data.error || "Не удалось сохранить шаблон.");
      return;
    }
  }

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5" onClick={onClose} role="presentation">
      <div
        className="flex max-h-[90vh] w-full max-w-[520px] flex-col overflow-hidden rounded-app border border-admin-border bg-admin-card shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pass-form-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-admin-border px-5 py-4">
          <h3 id="pass-form-title" className="m-0 text-[17px] font-extrabold text-night-text">
            {mode === "create" ? "Новый Pass" : "Редактировать Pass"}
          </h3>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="flex flex-col gap-4">
            {mode === "create" && templates.length > 0 && (
              <Label className="text-admin-muted">
                Начать из шаблона
                <Select value={templateId} onChange={(e) => applyTemplate(e.target.value)} className={FIELD_CLASS}>
                  <option value="">— выбрать —</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              </Label>
            )}

            <Label className="text-admin-muted">
              Название
              <Input value={name} onChange={(e) => setName(e.target.value)} className={FIELD_CLASS} placeholder="Full Pass" />
            </Label>

            <Label className="text-admin-muted">
              Описание
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className={FIELD_CLASS} rows={2} />
            </Label>

            <Label className="text-admin-muted">
              Тип
              <Select value={type} onChange={(e) => setType(e.target.value)} className={FIELD_CLASS}>
                {Object.entries(PASS_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Label>

            <Label className="text-admin-muted">
              Обложка (ссылка на изображение)
              <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} className={FIELD_CLASS} placeholder="https://…" />
            </Label>

            <div className="rounded-app-sm border border-admin-border p-3">
              <label className="flex items-center gap-2 text-sm text-night-text">
                <input type="checkbox" checked={isFree} onChange={(e) => setIsFree(e.target.checked)} className="accent-admin-primary" />
                Бесплатный Pass
              </label>
              {!isFree && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Label className="text-admin-muted">
                    Цена
                    <Input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className={FIELD_CLASS} />
                  </Label>
                  <Label className="text-admin-muted">
                    Валюта
                    <Input value={currency} onChange={(e) => setCurrency(e.target.value)} className={FIELD_CLASS} placeholder="BYN" />
                  </Label>
                </div>
              )}

              {scope === "event" && !isFree && (
                <div className="mt-3 border-t border-admin-border pt-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="m-0 text-sm text-night-text">Ценовые периоды (Early Bird и т.д.)</p>
                    <button
                      type="button"
                      className="text-xs text-admin-primaryHover hover:underline"
                      onClick={() => setEditingTier("new")}
                    >
                      + Добавить период
                    </button>
                  </div>
                  {tiers.length === 0 ? (
                    <p className="m-0 mt-1 text-xs text-admin-muted">Периодов нет — действует цена, указанная выше.</p>
                  ) : (
                    <div className="mt-2 flex flex-col gap-1.5">
                      {tiers.map((tier, i) => (
                        <div
                          key={tier.id ?? `new-${i}`}
                          className="flex items-center justify-between gap-2 rounded-app-sm border border-admin-border bg-admin-card2/50 px-2.5 py-1.5 text-sm"
                        >
                          <div className="min-w-0">
                            <span className="font-semibold text-night-text">{tier.label}</span>{" "}
                            <span className="text-admin-muted">
                              {tier.price} {tier.currency}
                            </span>
                            {(tier.validFrom || tier.validUntil) && (
                              <p className="m-0 text-xs text-admin-disabled">
                                {tier.validFrom && `с ${formatShortDate(tier.validFrom)}`}
                                {tier.validFrom && tier.validUntil && " "}
                                {tier.validUntil && `до ${formatShortDate(tier.validUntil)}`}
                              </p>
                            )}
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <button type="button" className="text-xs text-admin-primaryHover hover:underline" onClick={() => setEditingTier(i)}>
                              Изменить
                            </button>
                            <button
                              type="button"
                              className="text-admin-muted hover:text-red-400"
                              aria-label="Удалить период"
                              onClick={() => setTiers((prev) => prev.filter((_, idx) => idx !== i))}
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-app-sm border border-admin-border p-3">
              <label className="flex items-center gap-2 text-sm text-night-text">
                <input type="checkbox" checked={unlimited} onChange={(e) => setUnlimited(e.target.checked)} className="accent-admin-primary" />
                Без ограничения количества
              </label>
              {!unlimited && (
                <Label className="mt-2 text-admin-muted">
                  Количество мест
                  <Input type="number" min="1" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={FIELD_CLASS} />
                </Label>
              )}
            </div>

            {scope === "event" && (
              <div className="rounded-app-sm border border-admin-border p-3">
                <label className="flex items-center gap-2 text-sm text-night-text">
                  <input type="checkbox" checked={noSalesWindow} onChange={(e) => setNoSalesWindow(e.target.checked)} className="accent-admin-primary" />
                  Без ограничений по времени продажи
                </label>
                {!noSalesWindow && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Label className="text-admin-muted">
                      Начало продаж
                      <DateTimeField value={salesStartAt} onChange={setSalesStartAt} className={FIELD_CLASS} />
                    </Label>
                    <Label className="text-admin-muted">
                      Окончание продаж
                      <DateTimeField value={salesEndAt} onChange={setSalesEndAt} className={FIELD_CLASS} />
                    </Label>
                    <Label className="text-admin-muted">
                      Действует с
                      <DateTimeField value={validFrom} onChange={setValidFrom} className={FIELD_CLASS} />
                    </Label>
                    <Label className="text-admin-muted">
                      Действует до
                      <DateTimeField value={validUntil} onChange={setValidUntil} className={FIELD_CLASS} />
                    </Label>
                  </div>
                )}
              </div>
            )}

            <label className="flex items-center gap-2 text-sm text-night-text">
              <input
                type="checkbox"
                checked={allowMultipleEntry}
                onChange={(e) => setAllowMultipleEntry(e.target.checked)}
                className="accent-admin-primary"
              />
              Разрешить повторный вход
            </label>

            {scope === "event" && (
              <div className="rounded-app-sm border border-admin-border p-3">
                <Label className="text-admin-muted">
                  Условия возврата
                  <Select value={refundPolicy} onChange={(e) => setRefundPolicy(e.target.value)} className={FIELD_CLASS}>
                    {Object.entries(REFUND_POLICY_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </Label>
                {refundPolicy === "UNTIL_DATE" && (
                  <Label className="mt-2 text-admin-muted">
                    Возврат возможен до
                    <DateTimeField value={refundDeadline} onChange={setRefundDeadline} className={FIELD_CLASS} />
                  </Label>
                )}
                {refundPolicy === "PARTIAL" && (
                  <Label className="mt-2 text-admin-muted">
                    Комиссия за возврат, %
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={refundFeePercent}
                      onChange={(e) => setRefundFeePercent(e.target.value)}
                      className={FIELD_CLASS}
                    />
                  </Label>
                )}
              </div>
            )}

            {accessOptions.length > 0 && (
              <div className="rounded-app-sm border border-admin-border p-3">
                <p className="m-0 mb-2 text-xs font-semibold uppercase tracking-wide text-admin-muted">Доступ к программе</p>
                <p className="m-0 mb-2 text-xs text-admin-muted">Ничего не выбрано — Pass даёт доступ ко всему.</p>
                <div className="flex max-h-[160px] flex-col gap-1 overflow-y-auto">
                  {accessOptions.map((opt) => (
                    <label key={opt.id} className="flex items-center gap-2 rounded-app-sm px-1 py-1 text-sm text-night-text hover:bg-admin-card2">
                      <input
                        type="checkbox"
                        checked={selectedTargets.includes(opt.id)}
                        onChange={() => toggleTarget(opt.id)}
                        className="accent-admin-primary"
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {error && <p className="m-0 px-5 py-2 text-xs text-red-400">{error}</p>}

        <div className="flex flex-wrap items-center gap-2 border-t border-admin-border px-5 py-4">
          {scope === "event" && mode === "edit" && (
            <Button type="button" size="sm" variant="adminOutline" disabled={loading} onClick={saveAsTemplate}>
              Сохранить как шаблон
            </Button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Button type="button" size="sm" variant="ghost" className="text-admin-muted hover:text-admin-primaryHover" onClick={onClose}>
              Отмена
            </Button>
            <Button type="button" size="sm" variant="admin" disabled={loading} onClick={submit}>
              {mode === "create" ? "Создать" : "Сохранить"}
            </Button>
          </div>
        </div>
      </div>
    </div>
    {editingTier !== null && (
      <PriceTierFormModal
        initial={editingTier === "new" ? null : tiers[editingTier]}
        defaultCurrency={currency || "BYN"}
        onClose={() => setEditingTier(null)}
        onSave={(form) => {
          setTiers((prev) => (editingTier === "new" ? [...prev, form] : prev.map((row, idx) => (idx === editingTier ? form : row))));
          setEditingTier(null);
        }}
      />
    )}
    </>
  );
}
