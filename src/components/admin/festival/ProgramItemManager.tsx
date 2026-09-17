"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  ProgramItemFormModal,
  PROGRAM_ITEM_TYPE_LABELS,
  type ProgramItemFormValue,
  type TeacherOption,
  type LinkedEventOption,
} from "./ProgramItemFormModal";

export type ProgramItemRow = ProgramItemFormValue & { teacherName: string | null };

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
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

// Вкладка «Программа» консоли фестиваля (перенос UI, docs/PROGRESS.md —
// Festival Engine UI transfer) — таблица пунктов программы + модалка
// создания/редактирования, тот же паттерн, что и PassManager.tsx (Events
// Engine).
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
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(itemId: string, title: string) {
    if (!window.confirm(`Удалить пункт программы «${title}»?`)) return;
    setLoadingId(itemId);
    setError(null);
    const res = await fetch(`/api/festivals/${festivalId}/program-items/${itemId}`, { method: "DELETE" });
    setLoadingId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.message || data.error || "Не удалось удалить пункт программы.");
      return;
    }
    router.refresh();
  }

  const ACTION_CLASS = "text-xs text-admin-muted hover:text-night-text hover:underline disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="m-0 text-sm text-admin-muted">
          {items.length} {pluralizeItems(items.length)} программы.
        </p>
        <Button type="button" variant="admin" size="sm" onClick={() => setModal({ mode: "create" })}>
          + Добавить пункт
        </Button>
      </div>

      {error && <p className="m-0 text-sm text-red-400">{error}</p>}

      {items.length === 0 ? (
        <p className="text-sm text-admin-muted">Программа пока не заполнена.</p>
      ) : (
        <div className="overflow-x-auto rounded-app border border-admin-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-admin-card2 text-xs font-semibold uppercase tracking-wide text-admin-disabled">
              <tr>
                <th className="px-3 py-2 font-semibold">Пункт программы</th>
                <th className="px-3 py-2 font-semibold">Время</th>
                <th className="px-3 py-2 font-semibold">Артист</th>
                <th className="px-3 py-2 font-semibold">Места</th>
                <th className="px-3 py-2 text-right font-semibold">Действия</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-admin-border hover:bg-admin-card2/50">
                  <td className="px-3 py-2 align-top">
                    <p className="m-0 font-medium text-night-text">{item.title}</p>
                    <p className="m-0 text-xs text-admin-muted">{PROGRAM_ITEM_TYPE_LABELS[item.type] ?? item.type}</p>
                  </td>
                  <td className="px-3 py-2 align-top text-night-text">
                    {formatDateTime(item.startTime)}
                    {item.endTime ? ` — ${formatDateTime(item.endTime)}` : ""}
                  </td>
                  <td className="px-3 py-2 align-top text-night-text">{item.teacherName ?? "—"}</td>
                  <td className="px-3 py-2 align-top text-night-text">{item.capacity ?? "без ограничения"}</td>
                  <td className="px-3 py-2 align-top">
                    <div className="flex flex-wrap justify-end gap-2">
                      <button type="button" className={ACTION_CLASS} onClick={() => setModal({ mode: "edit", item })}>
                        Изменить
                      </button>
                      <button
                        type="button"
                        disabled={loadingId === item.id}
                        className={`${ACTION_CLASS} hover:text-red-400`}
                        onClick={() => handleDelete(item.id, item.title)}
                      >
                        Удалить
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
    </div>
  );
}
