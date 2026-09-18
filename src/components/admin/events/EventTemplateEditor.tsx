"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { t } from "@/lib/i18n/dictionary";
import { Input, Label, Select, Textarea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { TimeField } from "@/components/ui/TimeField";
import { PassFormModal } from "./PassFormModal";
import { EVENT_TYPE_REGISTRY, WIZARD_SELECTABLE_EVENT_FORMATS } from "@/lib/events/event-type-registry";

const fieldClass = "border-admin-border bg-admin-card2 text-night-text focus:border-admin-primary focus:ring-admin-primary/20";
const groupClass = "flex flex-col gap-3 rounded-app border border-admin-border bg-admin-card p-4";
const groupLabelClass = "m-0 text-[10.5px] font-semibold uppercase tracking-wide text-admin-muted";

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

export type EventTemplateTicketRow = { name: string; description: string | null; price: number | null; currency: string | null; quantity: number | null };
export type EventTemplatePassRow = EventTemplateTicketRow & { type: string; imageUrl: string | null; allowMultipleEntry: boolean };

export type EventTemplateDetail = {
  id: string;
  name: string;
  description: string | null;
  format: string;
  level: string;
  cityId: string | null;
  venueName: string | null;
  venueAddress: string | null;
  defaultStartTime: string | null;
  defaultEndTime: string | null;
  ticketingMode: string;
  registrationEnabled: boolean;
  capacity: number | null;
  priceText: string | null;
  externalLinkUrl: string | null;
  tags: string[];
  ticketTypes: EventTemplateTicketRow[];
  passes: EventTemplatePassRow[];
};

// Строковое представление формы билета — тот же приём, что и у WizardDraft
// (wizard-types.ts): числа как строки, сериализация в правильные типы
// происходит один раз перед PATCH. Pass больше не имеет своей строковой
// формы здесь — PassFormModal (scope="template") сам отдаёт готовый
// EventTemplatePassRow-совместимый объект через onSubmit, см. ниже.
type TicketForm = { name: string; description: string; price: string; currency: string; quantity: string };

function toTicketForm(t?: EventTemplateTicketRow): TicketForm {
  return { name: t?.name ?? "", description: t?.description ?? "", price: t?.price != null ? String(t.price) : "", currency: t?.currency ?? "BYN", quantity: t?.quantity != null ? String(t.quantity) : "" };
}

function formatMoney(price: string, currency: string): string {
  return price ? `${price} ${currency}` : "Бесплатно";
}
function formatMoneyNum(price: number | null, currency: string | null): string {
  return price != null ? `${price} ${currency ?? ""}`.trim() : "Бесплатно";
}

// Попап добавления/редактирования билета (2026-09-18, по прямому запросу
// пользователя — раньше это была тесная inline-строка в таблице; теперь
// тот же стиль модалки, что и у "настоящего" Pass/TicketType в
// PassFormModal.tsx/TicketTypeManager.tsx, только без полей, которые у
// шаблона в принципе не бывают (даты продаж, refund policy, access grants
// — см. комментарий у EventTemplate.ticketTypes/passes в schema.prisma).
function EventTemplateTicketModal({ initial, onSave, onClose }: { initial: TicketForm | null; onSave: (form: TicketForm) => void; onClose: () => void }) {
  const [form, setForm] = useState<TicketForm>(initial ?? toTicketForm());
  const [unlimited, setUnlimited] = useState(!initial || !initial.quantity);
  const [isFree, setIsFree] = useState(!initial || !initial.price);
  const [error, setError] = useState<string | null>(null);

  function save() {
    if (!form.name.trim()) {
      setError("Название обязательно.");
      return;
    }
    onSave({ ...form, price: isFree ? "" : form.price, quantity: unlimited ? "" : form.quantity });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5" onClick={onClose} role="presentation">
      <div
        className="flex max-h-[90vh] w-full max-w-[440px] flex-col overflow-hidden rounded-app border border-admin-border bg-admin-card shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="template-ticket-form-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-admin-border px-5 py-4">
          <h3 id="template-ticket-form-title" className="m-0 text-[17px] font-extrabold text-night-text">
            {initial ? "Изменить билет" : "Новый билет"}
          </h3>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="flex flex-col gap-3.5">
            <Label className="text-admin-muted">
              Название
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className={fieldClass} placeholder="Танцор" />
            </Label>
            <Label className="text-admin-muted">
              Описание
              <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className={fieldClass} rows={2} />
            </Label>
            <label className="flex items-center gap-2 text-sm text-admin-muted">
              <input type="checkbox" checked={isFree} onChange={(e) => setIsFree(e.target.checked)} className="accent-admin-primary" />
              Бесплатный
            </label>
            {!isFree && (
              <div className="grid grid-cols-2 gap-3">
                <Label className="text-admin-muted">
                  Цена
                  <Input type="number" min="0" value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} className={fieldClass} />
                </Label>
                <Label className="text-admin-muted">
                  Валюта
                  <Input value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))} className={fieldClass} />
                </Label>
              </div>
            )}
            <label className="flex items-center gap-2 text-sm text-admin-muted">
              <input type="checkbox" checked={unlimited} onChange={(e) => setUnlimited(e.target.checked)} className="accent-admin-primary" />
              Без ограничения мест
            </label>
            {!unlimited && (
              <Label className="text-admin-muted">
                Мест
                <Input type="number" min="1" value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} className={fieldClass} />
              </Label>
            )}
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

// Экран шаблона (Recurring Events v2, по прямому запросу пользователя) —
// ОДНА страница без степпера (в отличие от EventWizard): у шаблона нет
// собственной даты/публикации, тащить туда весь мастер избыточно (см.
// обсуждение в CLAUDE.md §64/сессии — согласовано явно). Тикеты/Pass — те же
// "содержательные" поля, что и у PassTemplate: без дат продаж/valid-периодов
// и без soldQuantity/status (см. комментарий у EventTemplate.ticketTypes/
// passes, schema.prisma) — они появляются только на самом событии,
// созданном из этого шаблона.
export function EventTemplateEditor({ template, cities }: { template: EventTemplateDetail; cities: { id: string; nameRu: string }[] }) {
  const router = useRouter();
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description ?? "");
  const [format, setFormat] = useState(template.format);
  const [level, setLevel] = useState(template.level);
  const [cityId, setCityId] = useState(template.cityId ?? "");
  const [venueName, setVenueName] = useState(template.venueName ?? "");
  const [venueAddress, setVenueAddress] = useState(template.venueAddress ?? "");
  const [defaultStartTime, setDefaultStartTime] = useState(template.defaultStartTime ?? "");
  const [defaultEndTime, setDefaultEndTime] = useState(template.defaultEndTime ?? "");
  const [capacity, setCapacity] = useState(template.capacity != null ? String(template.capacity) : "");
  const [priceText, setPriceText] = useState(template.priceText ?? "");
  const [externalLinkUrl, setExternalLinkUrl] = useState(template.externalLinkUrl ?? "");
  const [tags, setTags] = useState(template.tags.join(", "));
  const [ticketTypes, setTicketTypes] = useState<TicketForm[]>(template.ticketTypes.map(toTicketForm));
  const [passes, setPasses] = useState<EventTemplatePassRow[]>(template.passes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  // Индекс редактируемой строки ("new" — попап создания, число — попап
  // редактирования существующей строки по индексу, null — попап закрыт).
  const [editingTicket, setEditingTicket] = useState<number | "new" | null>(null);
  const [editingPass, setEditingPass] = useState<number | "new" | null>(null);

  async function save() {
    if (!name.trim()) {
      setError("Название шаблона обязательно.");
      return;
    }
    if (ticketTypes.some((t) => !t.name.trim())) {
      setError("У каждого тикета должно быть название.");
      return;
    }
    if (passes.some((p) => !p.name.trim())) {
      setError("У каждого Pass должно быть название.");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/event-templates/${template.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        description: description.trim() || null,
        format,
        level,
        cityId: cityId || null,
        venueName: venueName.trim() || null,
        venueAddress: venueAddress.trim() || null,
        defaultStartTime: defaultStartTime || null,
        defaultEndTime: defaultEndTime || null,
        capacity: capacity ? Number(capacity) : null,
        priceText: priceText.trim() || null,
        externalLinkUrl: externalLinkUrl.trim() || null,
        tags: tags.split(",").map((x) => x.trim()).filter(Boolean),
        ticketTypes: ticketTypes.map((t) => ({
          name: t.name.trim(),
          description: t.description.trim() || null,
          price: t.price ? Number(t.price) : null,
          currency: t.price ? t.currency || null : null,
          quantity: t.quantity ? Number(t.quantity) : null,
        })),
        passes: passes.map((p) => ({
          name: p.name.trim(),
          description: p.description,
          type: p.type,
          price: p.price,
          currency: p.currency,
          quantity: p.quantity,
          imageUrl: p.imageUrl,
          allowMultipleEntry: p.allowMultipleEntry,
        })),
      }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(data.message || data.error || "Не удалось сохранить шаблон.");
      return;
    }
    setSavedAt(Date.now());
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className={groupClass}>
        <p className={groupLabelClass}>Основное</p>
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Label className="text-admin-muted">
            Название шаблона
            <Input value={name} onChange={(e) => setName(e.target.value)} className={fieldClass} />
          </Label>
          <Label className="text-admin-muted">
            Тип события
            <Select value={format} onChange={(e) => setFormat(e.target.value)} className={fieldClass}>
              {WIZARD_SELECTABLE_EVENT_FORMATS.map((f) => (
                <option key={f} value={f}>
                  {EVENT_TYPE_REGISTRY[f].icon} {EVENT_TYPE_REGISTRY[f].label}
                </option>
              ))}
            </Select>
          </Label>
        </div>
        <Label className="text-admin-muted">
          Описание
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className={fieldClass} rows={2} />
        </Label>
      </div>

      <div className={groupClass}>
        <p className={groupLabelClass}>Место проведения</p>
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Label className="text-admin-muted">
            {t.event.level}
            <Select value={level} onChange={(e) => setLevel(e.target.value)} className={fieldClass}>
              {Object.entries(t.event.levels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>
          </Label>
          <Label className="text-admin-muted">
            {t.event.city}
            <Select value={cityId} onChange={(e) => setCityId(e.target.value)} className={fieldClass}>
              <option value="">—</option>
              {cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nameRu}
                </option>
              ))}
            </Select>
          </Label>
        </div>
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Label className="text-admin-muted">
            {t.event.place}
            <Input value={venueName} onChange={(e) => setVenueName(e.target.value)} className={fieldClass} />
          </Label>
          <Label className="text-admin-muted">
            {t.event.addEventForm.addressLabel}
            <Input value={venueAddress} onChange={(e) => setVenueAddress(e.target.value)} className={fieldClass} />
          </Label>
        </div>
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Label className="text-admin-muted">
            Время начала (по умолчанию)
            <TimeField value={defaultStartTime} onChange={setDefaultStartTime} theme="admin" className={fieldClass} />
          </Label>
          <Label className="text-admin-muted">
            Время окончания (по умолчанию)
            <TimeField value={defaultEndTime} onChange={setDefaultEndTime} theme="admin" className={fieldClass} />
          </Label>
        </div>
      </div>

      <div className={groupClass}>
        <p className={groupLabelClass}>Дополнительно</p>
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Label className="text-admin-muted">
            {t.event.registerExternal}
            <Input value={externalLinkUrl} onChange={(e) => setExternalLinkUrl(e.target.value)} className={fieldClass} />
          </Label>
          <Label className="text-admin-muted">
            Вместимость
            <Input type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} className={fieldClass} />
          </Label>
        </div>
        <Label className="text-admin-muted">
          Цена текстом
          <Input value={priceText} onChange={(e) => setPriceText(e.target.value)} className={fieldClass} />
        </Label>
        <Label className="text-admin-muted">
          {t.event.tags} ({t.event.tagsHint})
          <Input value={tags} onChange={(e) => setTags(e.target.value)} className={fieldClass} />
        </Label>
      </div>

      <div className={groupClass}>
        <div className="flex items-center justify-between">
          <p className={groupLabelClass}>Билеты по умолчанию</p>
          <Button type="button" variant="adminOutline" size="sm" onClick={() => setEditingTicket("new")}>
            Добавить билет
          </Button>
        </div>
        {ticketTypes.length === 0 && <p className="m-0 text-xs text-admin-muted">Событие, созданное из шаблона, не получит ни одного билета автоматически.</p>}
        {ticketTypes.map((row, i) => (
          <div key={i} className="flex items-center justify-between gap-3 border-t border-admin-border pt-2.5 first:border-t-0 first:pt-0">
            <div className="min-w-0">
              <p className="m-0 truncate text-sm font-semibold text-night-text">{row.name || "Без названия"}</p>
              <p className="m-0 text-xs text-admin-muted">
                {formatMoney(row.price, row.currency)}
                {row.quantity ? ` · ${row.quantity} мест` : ""}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button type="button" className="p-1.5 text-xs text-admin-primaryHover hover:underline" onClick={() => setEditingTicket(i)}>
                Изменить
              </button>
              <button
                type="button"
                className="p-1.5 text-admin-muted hover:text-red-400"
                aria-label="Удалить билет"
                onClick={() => setTicketTypes((prev) => prev.filter((_, idx) => idx !== i))}
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className={groupClass}>
        <div className="flex items-center justify-between">
          <p className={groupLabelClass}>Pass по умолчанию</p>
          <Button type="button" variant="adminOutline" size="sm" onClick={() => setEditingPass("new")}>
            Добавить Pass
          </Button>
        </div>
        {passes.length === 0 && <p className="m-0 text-xs text-admin-muted">Событие, созданное из шаблона, не получит ни одного Pass автоматически.</p>}
        {passes.map((row, i) => (
          <div key={i} className="flex items-center justify-between gap-3 border-t border-admin-border pt-2.5 first:border-t-0 first:pt-0">
            <div className="min-w-0">
              <p className="m-0 truncate text-sm font-semibold text-night-text">{row.name || "Без названия"}</p>
              <p className="m-0 text-xs text-admin-muted">
                {PASS_TYPE_LABELS[row.type] ?? row.type} · {formatMoneyNum(row.price, row.currency)}
                {row.quantity ? ` · ${row.quantity} мест` : ""}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button type="button" className="p-1.5 text-xs text-admin-primaryHover hover:underline" onClick={() => setEditingPass(i)}>
                Изменить
              </button>
              <button
                type="button"
                className="p-1.5 text-admin-muted hover:text-red-400"
                aria-label="Удалить Pass"
                onClick={() => setPasses((prev) => prev.filter((_, idx) => idx !== i))}
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      {error && <p className="m-0 text-sm text-red-400">{error}</p>}
      <div className="flex items-center gap-3">
        <Button type="button" variant="admin" disabled={saving} onClick={save}>
          {saving ? "Сохраняем…" : "Сохранить"}
        </Button>
        {savedAt && <span className="text-xs text-night-success">Сохранено.</span>}
      </div>

      {editingTicket !== null && (
        <EventTemplateTicketModal
          initial={editingTicket === "new" ? null : ticketTypes[editingTicket]}
          onClose={() => setEditingTicket(null)}
          onSave={(form) => {
            setTicketTypes((prev) => (editingTicket === "new" ? [...prev, form] : prev.map((row, idx) => (idx === editingTicket ? form : row))));
            setEditingTicket(null);
          }}
        />
      )}
      {editingPass !== null && (
        <PassFormModal
          mode={editingPass === "new" ? "create" : "edit"}
          scope="template"
          initial={editingPass === "new" ? undefined : passes[editingPass]}
          onClose={() => setEditingPass(null)}
          onSubmit={(values) => {
            setPasses((prev) => (editingPass === "new" ? [...prev, values] : prev.map((row, idx) => (idx === editingPass ? values : row))));
          }}
        />
      )}
    </div>
  );
}
