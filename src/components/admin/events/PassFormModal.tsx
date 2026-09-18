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

// Создание/редактирование Pass (2026-09-16) — одна модалка на оба режима.
// Секции: основное, цена (+ Early Bird — один ценовой период в этом релизе
// UI, backend уже поддерживает несколько), количество/период продаж, доступ
// к пунктам программы/сессиям (только если у события они есть), обложка,
// повторный вход. "Начать из шаблона" — только в режиме создания.
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
  const [earlyBirdEnabled, setEarlyBirdEnabled] = useState(false);
  const [earlyBirdPrice, setEarlyBirdPrice] = useState("");
  const [earlyBirdUntil, setEarlyBirdUntil] = useState("");
  const [earlyBirdTierId, setEarlyBirdTierId] = useState<string | null>(null);
  const [selectedTargets, setSelectedTargets] = useState<string[]>(initialAccessTargetIds ?? []);
  const [templateId, setTemplateId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Редактирование — подтягиваем уже существующий Early Bird тир (если есть),
  // берём первый (см. комментарий класса выше про упрощение UI). Только для
  // scope="event" — у шаблона Early Bird не бывает вовсе.
  useEffect(() => {
    if (scope !== "event" || mode !== "edit" || !initial) return;
    fetch(`/api/events/${eventSlug}/passes/${initial.id}/price-tiers`)
      .then((r) => r.json())
      .then((data) => {
        const tier = data.tiers?.[0];
        if (tier) {
          setEarlyBirdEnabled(true);
          setEarlyBirdTierId(tier.id);
          setEarlyBirdPrice(String(tier.price));
          setEarlyBirdUntil(toLocalInput(tier.validUntil));
        }
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

    // Early Bird — один тир в этом релизе UI.
    if (earlyBirdEnabled && earlyBirdPrice) {
      const tierBody = {
        label: "Early Bird",
        price: Number(earlyBirdPrice),
        currency: isFree ? null : currency || null,
        validUntil: earlyBirdUntil ? new Date(earlyBirdUntil).toISOString() : null,
      };
      if (earlyBirdTierId) {
        await fetch(`/api/events/${eventSlug}/passes/${passId}/price-tiers/${earlyBirdTierId}`, {
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
    } else if (!earlyBirdEnabled && earlyBirdTierId) {
      await fetch(`/api/events/${eventSlug}/passes/${passId}/price-tiers/${earlyBirdTierId}`, { method: "DELETE" });
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
                  <label className="flex items-center gap-2 text-sm text-night-text">
                    <input
                      type="checkbox"
                      checked={earlyBirdEnabled}
                      onChange={(e) => setEarlyBirdEnabled(e.target.checked)}
                      className="accent-admin-primary"
                    />
                    Использовать Early Bird
                  </label>
                  {earlyBirdEnabled && (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <Label className="text-admin-muted">
                        Цена Early Bird
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={earlyBirdPrice}
                          onChange={(e) => setEarlyBirdPrice(e.target.value)}
                          className={FIELD_CLASS}
                        />
                      </Label>
                      <Label className="text-admin-muted">
                        До
                        <DateTimeField value={earlyBirdUntil} onChange={setEarlyBirdUntil} className={FIELD_CLASS} />
                      </Label>
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
  );
}
