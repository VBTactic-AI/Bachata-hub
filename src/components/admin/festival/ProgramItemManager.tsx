"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PencilIcon, TrashIcon, AlertIcon } from "@/components/admin/icons";
import { ConfirmModal } from "@/components/admin/ConfirmModal";
import { cn } from "@/lib/cn";
import {
  ProgramItemFormModal,
  PROGRAM_ITEM_TYPE_LABELS,
  type ProgramItemFormValue,
  type TeacherOption,
  type LinkedEventOption,
} from "./ProgramItemFormModal";

export type ProgramItemRow = ProgramItemFormValue & { teacherName: string | null };

const TYPE_CHIP_COLOR: Record<string, string> = {
  WORKSHOP: "bg-admin-primary",
  PARTY: "bg-admin-violet",
  COMPETITION: "bg-night-warning",
  OTHER: "bg-admin-disabled",
};

const dayFormatter = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short" });
const timeFormatter = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" });

function formatTimeRange(startIso: string, endIso: string | null): string {
  const start = timeFormatter.format(new Date(startIso));
  if (!endIso) return start;
  return `${start}–${timeFormatter.format(new Date(endIso))}`;
}

// Русское склонение "N пунктов программы" — 1/2-4/5+ (и исключение 11-14),
// тот же приём, что и pluralizeTypes в PassManager.tsx (Events Engine).
function pluralizeItems(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "пункт";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "пункта";
  return "пунктов";
}

function itemEnd(item: ProgramItemRow): number {
  if (item.endTime) return new Date(item.endTime).getTime();
  // Без явного окончания предполагаем час занятости — только для проверки
  // конфликтов, реальная длительность нигде не сохраняется.
  return new Date(item.startTime).getTime() + 60 * 60 * 1000;
}

// Конфликт — один и тот же артист занят в пересекающихся пунктах программы
// (Stage R4 переноса UI-прототипа, 2026-09-19). Только предупреждение, не
// блокирует сохранение — организатор мог сделать это осознанно (например,
// артист ведёт два коротких мастер-класса подряд с небольшим нахлёстом).
function findConflicts(items: ProgramItemRow[]): ProgramItemRow[] {
  const byTeacher = new Map<string, ProgramItemRow[]>();
  for (const item of items) {
    if (!item.teacherId) continue;
    const list = byTeacher.get(item.teacherId) ?? [];
    list.push(item);
    byTeacher.set(item.teacherId, list);
  }
  const conflicting = new Set<ProgramItemRow>();
  for (const list of byTeacher.values()) {
    const sorted = [...list].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const cur = sorted[i];
      if (new Date(cur.startTime).getTime() < itemEnd(prev)) {
        conflicting.add(prev);
        conflicting.add(cur);
      }
    }
  }
  return [...conflicting];
}

// Вкладка «Программа» консоли фестиваля (Stage R4 переноса UI-прототипа,
// 2026-09-19) — day-strip фильтр + цветные type-chip строки вместо таблицы,
// баннер конфликтов по артисту, переход по клику на связанный Event. Модалка
// создания/редактирования не менялась — тот же ProgramItemFormModal.
export function ProgramItemManager({
  festivalId,
  items,
  teachers,
  linkedEventOptions,
}: {
  festivalId: string;
  items: ProgramItemRow[];
  teachers: TeacherOption[];
  linkedEventOptions: LinkedEventOption[];
}) {
  const router = useRouter();
  const [modal, setModal] = useState<{ mode: "create" | "edit"; item?: ProgramItemRow } | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<ProgramItemRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const linkedEventTitleById = useMemo(() => new Map(linkedEventOptions.map((e) => [e.id, e.title])), [linkedEventOptions]);

  const sortedItems = useMemo(() => [...items].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()), [items]);

  const days = useMemo(() => {
    const map = new Map<string, Date>();
    for (const item of sortedItems) {
      const d = new Date(item.startTime);
      const key = d.toDateString();
      if (!map.has(key)) map.set(key, d);
    }
    return [...map.entries()].sort((a, b) => a[1].getTime() - b[1].getTime());
  }, [sortedItems]);

  const visibleItems = selectedDay ? sortedItems.filter((i) => new Date(i.startTime).toDateString() === selectedDay) : sortedItems;
  const conflicts = useMemo(() => findConflicts(items), [items]);

  async function handleDelete(item: ProgramItemRow) {
    setLoadingId(item.id);
    setError(null);
    const res = await fetch(`/api/festivals/${festivalId}/program-items/${item.id}`, { method: "DELETE" });
    setLoadingId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.message || data.error || "Не удалось удалить пункт программы.");
      return;
    }
    setConfirmingDelete(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="m-0 text-sm text-admin-muted">
          {items.length} {pluralizeItems(items.length)} программы.
        </p>
        <Button type="button" variant="admin" size="sm" onClick={() => setModal({ mode: "create" })}>
          Добавить пункт
        </Button>
      </div>

      {error && <p className="m-0 text-sm text-red-400">{error}</p>}

      {conflicts.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-app border border-night-warning/35 bg-night-warning/10 px-3.5 py-3 text-sm">
          <span className="mt-0.5 shrink-0 text-night-warning">
            <AlertIcon />
          </span>
          <p className="m-0 text-night-text">
            У одного артиста пересекаются по времени пункты:{" "}
            {conflicts.map((c, i) => (
              <span key={c.id}>
                {i > 0 ? ", " : ""}
                <b>«{c.title}»</b>
              </span>
            ))}
            . Программа сохранится как есть — просто перепроверьте расписание.
          </p>
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-admin-muted">Программа пока не заполнена.</p>
      ) : (
        <>
          {days.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedDay(null)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-bold",
                  selectedDay === null ? "border-admin-primary bg-admin-primary text-white" : "border-admin-border text-admin-muted hover:text-night-text"
                )}
              >
                Все дни
              </button>
              {days.map(([key, date]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedDay(key)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-bold capitalize",
                    selectedDay === key ? "border-admin-primary bg-admin-primary text-white" : "border-admin-border text-admin-muted hover:text-night-text"
                  )}
                >
                  {dayFormatter.format(date)}
                </button>
              ))}
            </div>
          )}

          <div className="rounded-app border border-admin-border">
            {visibleItems.map((item) => {
              const linkedTitle = item.linkedEventId ? linkedEventTitleById.get(item.linkedEventId) : null;
              const rowContent = (
                <>
                  <span className="w-[74px] shrink-0 text-xs tabular-nums text-admin-muted">{formatTimeRange(item.startTime, item.endTime)}</span>
                  <span className={cn("h-2.5 w-2.5 shrink-0 rounded-sm", TYPE_CHIP_COLOR[item.type] ?? TYPE_CHIP_COLOR.OTHER)} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-night-text">{item.title}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-admin-muted">
                      <span>{PROGRAM_ITEM_TYPE_LABELS[item.type] ?? item.type}</span>
                      {item.teacherName && <span>· {item.teacherName}</span>}
                      {item.capacity != null && <span>· {item.capacity} мест</span>}
                      {linkedTitle && <span className="font-semibold text-admin-primaryHover">· → {linkedTitle}</span>}
                    </span>
                  </span>
                  {linkedTitle && <span className="shrink-0 text-admin-primaryHover">→</span>}
                </>
              );

              return (
                <div key={item.id} className="flex items-center gap-3 border-b border-admin-border px-3.5 py-2.5 last:border-none">
                  {item.linkedEventId ? (
                    <Link
                      href={`/admin/content/${item.linkedEventId}`}
                      className="flex min-w-0 flex-1 items-center gap-3 no-underline hover:no-underline"
                    >
                      {rowContent}
                    </Link>
                  ) : (
                    <div className="flex min-w-0 flex-1 items-center gap-3">{rowContent}</div>
                  )}
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      title="Изменить"
                      aria-label="Изменить пункт программы"
                      onClick={() => setModal({ mode: "edit", item })}
                      className="inline-flex items-center justify-center rounded-app-sm p-1.5 text-admin-muted hover:bg-admin-card2 hover:text-night-text"
                    >
                      <PencilIcon />
                    </button>
                    <button
                      type="button"
                      title="Удалить"
                      aria-label="Удалить пункт программы"
                      disabled={loadingId === item.id}
                      onClick={() => setConfirmingDelete(item)}
                      className="inline-flex items-center justify-center rounded-app-sm p-1.5 text-admin-muted hover:bg-red-400/10 hover:text-red-400 disabled:opacity-50"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {modal && (
        <ProgramItemFormModal
          festivalId={festivalId}
          mode={modal.mode}
          initial={modal.item}
          teachers={teachers}
          linkedEventOptions={linkedEventOptions}
          onClose={() => setModal(null)}
        />
      )}

      {confirmingDelete && (
        <ConfirmModal
          title="Удалить пункт программы?"
          message={`«${confirmingDelete.title}» будет удалён без возможности восстановления.`}
          confirmLabel="Удалить"
          danger
          pending={loadingId === confirmingDelete.id}
          onConfirm={() => handleDelete(confirmingDelete)}
          onClose={() => setConfirmingDelete(null)}
        />
      )}
    </div>
  );
}
