"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { t } from "@/lib/i18n/dictionary";
import { Input, Label, Select, Textarea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
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

// Строковое представление формы — тот же приём, что и у WizardDraft
// (wizard-types.ts): числа/массивы как строки, сериализация в правильные
// типы происходит один раз перед PATCH.
type TicketForm = { name: string; description: string; price: string; currency: string; quantity: string };
type PassForm = TicketForm & { type: string; imageUrl: string; allowMultipleEntry: boolean };

function toTicketForm(t?: EventTemplateTicketRow): TicketForm {
  return { name: t?.name ?? "", description: t?.description ?? "", price: t?.price != null ? String(t.price) : "", currency: t?.currency ?? "BYN", quantity: t?.quantity != null ? String(t.quantity) : "" };
}
function toPassForm(p?: EventTemplatePassRow): PassForm {
  return { ...toTicketForm(p), type: p?.type ?? "FULL_PASS", imageUrl: p?.imageUrl ?? "", allowMultipleEntry: p?.allowMultipleEntry ?? true };
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
  const [passes, setPasses] = useState<PassForm[]>(template.passes.map(toPassForm));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function updateTicket(i: number, patch: Partial<TicketForm>) {
    setTicketTypes((prev) => prev.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }
  function updatePass(i: number, patch: Partial<PassForm>) {
    setPasses((prev) => prev.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

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
          description: p.description.trim() || null,
          type: p.type,
          price: p.price ? Number(p.price) : null,
          currency: p.price ? p.currency || null : null,
          quantity: p.quantity ? Number(p.quantity) : null,
          imageUrl: p.imageUrl.trim() || null,
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
            <Input type="time" value={defaultStartTime} onChange={(e) => setDefaultStartTime(e.target.value)} className={fieldClass} />
          </Label>
          <Label className="text-admin-muted">
            Время окончания (по умолчанию)
            <Input type="time" value={defaultEndTime} onChange={(e) => setDefaultEndTime(e.target.value)} className={fieldClass} />
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
          <p className={groupLabelClass}>Тикеты по умолчанию</p>
          <Button type="button" variant="adminOutline" size="sm" onClick={() => setTicketTypes((prev) => [...prev, toTicketForm()])}>
            + Добавить тикет
          </Button>
        </div>
        {ticketTypes.length === 0 && <p className="m-0 text-xs text-admin-muted">Событие, созданное из шаблона, не получит ни одного тикета автоматически.</p>}
        {ticketTypes.map((row, i) => (
          <div key={i} className="grid grid-cols-1 items-end gap-2 border-t border-admin-border pt-3 first:border-t-0 first:pt-0 sm:grid-cols-[1fr_100px_90px_auto]">
            <Label className="text-xs text-admin-muted">
              Название
              <Input value={row.name} onChange={(e) => updateTicket(i, { name: e.target.value })} className={fieldClass} />
            </Label>
            <Label className="text-xs text-admin-muted">
              Цена
              <Input type="number" min="0" value={row.price} onChange={(e) => updateTicket(i, { price: e.target.value })} className={fieldClass} />
            </Label>
            <Label className="text-xs text-admin-muted">
              Мест
              <Input type="number" min="1" value={row.quantity} onChange={(e) => updateTicket(i, { quantity: e.target.value })} className={fieldClass} />
            </Label>
            <button
              type="button"
              className="justify-self-end p-2 text-admin-muted hover:text-red-400"
              aria-label="Удалить тикет"
              onClick={() => setTicketTypes((prev) => prev.filter((_, idx) => idx !== i))}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className={groupClass}>
        <div className="flex items-center justify-between">
          <p className={groupLabelClass}>Pass по умолчанию</p>
          <Button type="button" variant="adminOutline" size="sm" onClick={() => setPasses((prev) => [...prev, toPassForm()])}>
            + Добавить Pass
          </Button>
        </div>
        {passes.length === 0 && <p className="m-0 text-xs text-admin-muted">Событие, созданное из шаблона, не получит ни одного Pass автоматически.</p>}
        {passes.map((row, i) => (
          <div key={i} className="grid grid-cols-1 items-end gap-2 border-t border-admin-border pt-3 first:border-t-0 first:pt-0 sm:grid-cols-[1fr_110px_90px_auto_auto]">
            <Label className="text-xs text-admin-muted">
              Название
              <Input value={row.name} onChange={(e) => updatePass(i, { name: e.target.value })} className={fieldClass} />
            </Label>
            <Label className="text-xs text-admin-muted">
              Тип
              <Select value={row.type} onChange={(e) => updatePass(i, { type: e.target.value })} className={fieldClass}>
                {Object.entries(PASS_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Label>
            <Label className="text-xs text-admin-muted">
              Цена
              <Input type="number" min="0" value={row.price} onChange={(e) => updatePass(i, { price: e.target.value })} className={fieldClass} />
            </Label>
            <label className="flex items-center gap-1.5 pb-2.5 text-xs text-admin-muted">
              <input type="checkbox" checked={row.allowMultipleEntry} onChange={(e) => updatePass(i, { allowMultipleEntry: e.target.checked })} className="accent-admin-primary" />
              Повтор. вход
            </label>
            <button
              type="button"
              className="justify-self-end p-2 text-admin-muted hover:text-red-400"
              aria-label="Удалить Pass"
              onClick={() => setPasses((prev) => prev.filter((_, idx) => idx !== i))}
            >
              ✕
            </button>
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
    </div>
  );
}
