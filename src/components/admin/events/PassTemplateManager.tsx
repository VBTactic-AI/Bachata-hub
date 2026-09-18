"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Select, Textarea, Label } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

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

export type PassTemplateRow = {
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

type FormState = {
  name: string;
  description: string;
  type: string;
  price: string;
  currency: string;
  quantity: string;
  imageUrl: string;
  allowMultipleEntry: boolean;
};

function emptyForm(): FormState {
  return { name: "", description: "", type: "FULL_PASS", price: "", currency: "BYN", quantity: "", imageUrl: "", allowMultipleEntry: true };
}

function toForm(t: PassTemplateRow): FormState {
  return {
    name: t.name,
    description: t.description ?? "",
    type: t.type,
    price: t.price != null ? String(t.price) : "",
    currency: t.currency ?? "BYN",
    quantity: t.quantity != null ? String(t.quantity) : "",
    imageUrl: t.imageUrl ?? "",
    allowMultipleEntry: t.allowMultipleEntry,
  };
}

// Шаблоны Pass организатора — простой CRUD-список без модалки (в отличие от
// PassFormModal — тут нет дат/доступа/Early Bird, форма компактнее и
// помещается прямо в строке карточки).
export function PassTemplateManager({ templates: initialTemplates }: { templates: PassTemplateRow[] }) {
  const router = useRouter();
  const [templates, setTemplates] = useState(initialTemplates);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startCreate() {
    setForm(emptyForm());
    setCreating(true);
    setEditingId(null);
  }
  function startEdit(t: PassTemplateRow) {
    setForm(toForm(t));
    setEditingId(t.id);
    setCreating(false);
  }
  function cancel() {
    setCreating(false);
    setEditingId(null);
  }

  function buildBody() {
    return {
      name: form.name.trim(),
      description: form.description.trim() || null,
      type: form.type,
      price: form.price ? Number(form.price) : null,
      currency: form.price ? form.currency || null : null,
      quantity: form.quantity ? Number(form.quantity) : null,
      imageUrl: form.imageUrl.trim() || null,
      allowMultipleEntry: form.allowMultipleEntry,
    };
  }

  async function save() {
    if (!form.name.trim()) {
      setError("Название обязательно.");
      return;
    }
    setLoading(true);
    setError(null);
    const url = editingId ? `/api/pass-templates/${editingId}` : "/api/pass-templates";
    const res = await fetch(url, {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildBody()),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(data.message || data.error || "Не удалось сохранить шаблон.");
      return;
    }
    if (editingId) {
      setTemplates((prev) => prev.map((t) => (t.id === editingId ? data.template : t)));
    } else {
      setTemplates((prev) => [data.template, ...prev]);
    }
    cancel();
    router.refresh();
  }

  async function remove(id: string) {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/pass-templates/${id}`, { method: "DELETE" });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.message || data.error || "Не удалось удалить шаблон.");
      return;
    }
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    router.refresh();
  }

  function renderForm() {
    return (
      <div className="flex flex-col gap-3 rounded-app border border-admin-border bg-admin-card p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Label className="text-admin-muted">
            Название
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={FIELD_CLASS} />
          </Label>
          <Label className="text-admin-muted">
            Тип
            <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className={FIELD_CLASS}>
              {Object.entries(PASS_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Label>
        </div>
        <Label className="text-admin-muted">
          Описание
          <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={FIELD_CLASS} rows={2} />
        </Label>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Label className="text-admin-muted">
            Цена
            <Input type="number" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className={FIELD_CLASS} />
          </Label>
          <Label className="text-admin-muted">
            Валюта
            <Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className={FIELD_CLASS} />
          </Label>
          <Label className="text-admin-muted">
            Мест по умолчанию
            <Input
              type="number"
              min="1"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              className={FIELD_CLASS}
            />
          </Label>
          <Label className="text-admin-muted">
            Обложка (URL)
            <Input value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} className={FIELD_CLASS} />
          </Label>
        </div>
        <label className="flex items-center gap-2 text-sm text-night-text">
          <input
            type="checkbox"
            checked={form.allowMultipleEntry}
            onChange={(e) => setForm({ ...form, allowMultipleEntry: e.target.checked })}
            className="accent-admin-primary"
          />
          Разрешить повторный вход по умолчанию
        </label>
        {error && <p className="m-0 text-xs text-red-400">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" className="text-admin-muted hover:text-admin-primaryHover" onClick={cancel}>
            Отмена
          </Button>
          <Button type="button" variant="admin" size="sm" disabled={loading} onClick={save}>
            Сохранить
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        {!creating && <Button type="button" variant="admin" size="sm" onClick={startCreate}>
          Новый шаблон
        </Button>}
      </div>

      {creating && renderForm()}

      {templates.length === 0 && !creating ? (
        <p className="text-sm text-admin-muted">Шаблонов пока нет — создайте первый или сохраните существующий Pass как шаблон.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {templates.map((t) =>
            editingId === t.id ? (
              <div key={t.id}>{renderForm()}</div>
            ) : (
              <div key={t.id} className="flex items-center justify-between gap-3 rounded-app border border-admin-border bg-admin-card p-3">
                <div>
                  <p className="m-0 font-medium text-night-text">{t.name}</p>
                  <p className="m-0 text-xs text-admin-muted">
                    {PASS_TYPE_LABELS[t.type] ?? t.type}
                    {t.price != null ? ` · ${t.price} ${t.currency ?? ""}` : " · бесплатно"}
                    {t.quantity != null ? ` · ${t.quantity} мест` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button type="button" className="text-xs text-admin-muted hover:text-night-text hover:underline" onClick={() => startEdit(t)}>
                    Изменить
                  </button>
                  <button
                    type="button"
                    disabled={loading}
                    className="text-xs text-admin-muted hover:text-red-400 hover:underline"
                    onClick={() => remove(t.id)}
                  >
                    Удалить
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
