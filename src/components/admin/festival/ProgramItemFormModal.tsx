"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Select, Label } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { DateTimeField } from "@/components/ui/DateTimeField";

const FIELD_CLASS = "border-admin-border bg-admin-card2 text-night-text focus:border-admin-primary focus:ring-admin-primary/20";

export const PROGRAM_ITEM_TYPE_LABELS: Record<string, string> = {
  WORKSHOP: "Мастер-класс",
  PARTY: "Вечеринка",
  COMPETITION: "Конкурс",
  OTHER: "Другое",
};

export type TeacherOption = { id: string; label: string };
export type LinkedEventOption = { id: string; title: string };

export type ProgramItemFormValue = {
  id: string;
  title: string;
  type: string;
  startTime: string; // ISO
  endTime: string | null; // ISO
  teacherId: string | null;
  linkedEventId: string | null;
  capacity: number | null;
  showCapacityPublicly: boolean;
};

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 16);
}

// Создание/редактирование пункта программы фестиваля (перенос UI, вкладка
// «Программа», docs/PROGRESS.md — Festival Engine UI transfer). Один и тот
// же модал на оба режима — тот же приём, что и PassFormModal.tsx.
export function ProgramItemFormModal({
  festivalId,
  mode,
  initial,
  teachers,
  linkedEventOptions,
  onClose,
}: {
  festivalId: string;
  mode: "create" | "edit";
  initial?: ProgramItemFormValue;
  teachers: TeacherOption[];
  linkedEventOptions: LinkedEventOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [type, setType] = useState(initial?.type ?? "WORKSHOP");
  const [startTime, setStartTime] = useState(toLocalInput(initial?.startTime ?? null));
  const [endTime, setEndTime] = useState(toLocalInput(initial?.endTime ?? null));
  const [teacherId, setTeacherId] = useState(initial?.teacherId ?? "");
  const [linkedEventId, setLinkedEventId] = useState(initial?.linkedEventId ?? "");
  const [hasCapacity, setHasCapacity] = useState(initial?.capacity != null);
  const [capacity, setCapacity] = useState(initial?.capacity != null ? String(initial.capacity) : "");
  const [showCapacityPublicly, setShowCapacityPublicly] = useState(initial?.showCapacityPublicly ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        title,
        type,
        startTime: new Date(startTime).toISOString(),
        endTime: endTime ? new Date(endTime).toISOString() : null,
        teacherId: teacherId || null,
        linkedEventId: linkedEventId || null,
        capacity: hasCapacity && capacity ? Number(capacity) : null,
        showCapacityPublicly,
      };
      const url =
        mode === "create"
          ? `/api/festivals/${festivalId}/program-items`
          : `/api/festivals/${festivalId}/program-items/${initial!.id}`;
      const res = await fetch(url, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.message ?? "Не удалось сохранить пункт программы.");
        return;
      }
      onClose();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5" onClick={onClose} role="presentation">
      <div
        className="flex max-h-[90vh] w-full max-w-[520px] flex-col overflow-hidden rounded-app border border-admin-border bg-admin-card shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="program-item-form-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-admin-border px-5 py-4">
          <h3 id="program-item-form-title" className="m-0 text-[17px] font-extrabold text-night-text">
            {mode === "create" ? "Новый пункт программы" : "Редактировать пункт программы"}
          </h3>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="flex flex-col gap-4">
            {error && <p className="m-0 text-sm text-red-400">{error}</p>}

            <Label className="text-admin-muted">
              Название
              <Input value={title} onChange={(e) => setTitle(e.target.value)} className={FIELD_CLASS} placeholder="Bachata Sensual с Ana" required />
            </Label>

            <Label className="text-admin-muted">
              Тип
              <Select value={type} onChange={(e) => setType(e.target.value)} className={FIELD_CLASS}>
                {Object.entries(PROGRAM_ITEM_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Label>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Label className="text-admin-muted">
                Начало
                <DateTimeField value={startTime} onChange={setStartTime} theme="admin" className={FIELD_CLASS} required />
              </Label>
              <Label className="text-admin-muted">
                Окончание
                <DateTimeField value={endTime} onChange={setEndTime} theme="admin" className={FIELD_CLASS} />
              </Label>
            </div>

            <Label className="text-admin-muted">
              Артист
              <Select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} className={FIELD_CLASS}>
                <option value="">— без артиста —</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Label>

            <Label className="text-admin-muted">
              Отдельное событие (если у пункта своя публичная страница/билеты)
              <Select value={linkedEventId} onChange={(e) => setLinkedEventId(e.target.value)} className={FIELD_CLASS}>
                <option value="">— нет —</option>
                {linkedEventOptions.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title}
                  </option>
                ))}
              </Select>
            </Label>

            <label className="flex items-center gap-2 text-sm text-night-text">
              <input type="checkbox" checked={hasCapacity} onChange={(e) => setHasCapacity(e.target.checked)} />
              Ограничить количество мест
            </label>
            {hasCapacity && (
              <div className="flex flex-col gap-2 pl-6">
                <Input
                  type="number"
                  min={1}
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                  className={FIELD_CLASS}
                  placeholder="30"
                />
                <label className="flex items-center gap-2 text-sm text-night-text">
                  <input type="checkbox" checked={showCapacityPublicly} onChange={(e) => setShowCapacityPublicly(e.target.checked)} />
                  Показывать остаток мест на публичной странице
                </label>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-admin-border px-5 py-4">
          <Button type="button" variant="adminOutline" onClick={onClose} disabled={saving}>
            Отмена
          </Button>
          <Button type="submit" variant="admin" disabled={saving || !title.trim() || !startTime}>
            {saving ? "Сохранение…" : "Сохранить"}
          </Button>
        </div>
        </form>
      </div>
    </div>
  );
}
