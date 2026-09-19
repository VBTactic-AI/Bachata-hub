"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge, type StatusBadgeVariant } from "@/components/admin/StatusBadge";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/admin/ConfirmModal";
import { PencilIcon, PlayIcon, PauseIcon, ArchiveBoxIcon, TrashIcon } from "@/components/admin/icons";
import { PassFormModal, type PassFormValue, type PassTemplateOption, type AccessTargetOption } from "./PassFormModal";

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

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Черновик",
  ACTIVE: "Активен",
  PAUSED: "На паузе",
  SOLD_OUT: "Распродан",
  ENDED: "Завершён",
  ARCHIVED: "Закрыт",
};

// Русское склонение "N типов доступа" — 1/2-4/5+ (и исключение 11-14).
function pluralizeTypes(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "тип";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "типа";
  return "типов";
}

const STATUS_VARIANTS: Record<string, StatusBadgeVariant> = {
  DRAFT: "neutral",
  ACTIVE: "success",
  PAUSED: "warning",
  SOLD_OUT: "danger",
  ENDED: "neutral",
  ARCHIVED: "neutral",
};

// id переопределён как обязательный (2026-09-18) — PassFormValue.id стал
// optional, когда PassFormModal научился работать в scope="template" (там
// строка ещё не сохранена и id не существует), но реальный Pass из БД
// (PassRow — только для этого места, "настоящие" Pass события) id всегда
// имеет.
export type PassRow = PassFormValue & {
  id: string;
  status: string;
  soldQuantity: number;
  availableQuantity: number | null;
};

// Карточки-строки с прогресс-баром вместо таблицы (перенос UI-прототипа
// Festival Engine, Stage R6, 2026-09-19, по прямому запросу пользователя —
// "перевести в карточки повсюду") — компонент общий с обычной консолью
// события (`/admin/content/[id]/passes`), поэтому решение сознательно
// затрагивает весь Events Engine, не только фестивали.
export function PassManager({
  eventSlug,
  registrationsPath,
  passes,
  templates,
  accessOptions,
}: {
  eventSlug: string;
  registrationsPath: string;
  passes: PassRow[];
  templates: PassTemplateOption[];
  accessOptions: AccessTargetOption[];
}) {
  const router = useRouter();
  const [modal, setModal] = useState<{ mode: "create" | "edit"; pass?: PassRow } | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<PassRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function setStatus(passId: string, status: string) {
    setLoadingId(passId);
    setError(null);
    const res = await fetch(`/api/events/${eventSlug}/passes/${passId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setLoadingId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.message || data.error || "Не удалось изменить статус.");
      return;
    }
    router.refresh();
  }

  // Настоящее удаление (2026-09-16, по прямому запросу пользователя) —
  // только для Pass, по которому ещё никто не покупал билет (soldQuantity
  // === 0, см. deletePass в pass-service.ts). Для уже проданных — только
  // "Закрыть" (архивация), сервер это и так отклонит понятной ошибкой, но
  // кнопка здесь просто не показывается, чтобы не провоцировать.
  async function deletePassPermanently(pass: PassRow) {
    setLoadingId(pass.id);
    setError(null);
    const res = await fetch(`/api/events/${eventSlug}/passes/${pass.id}`, { method: "DELETE" });
    setLoadingId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.message || data.error || "Не удалось удалить Pass.");
      return;
    }
    setConfirmingDelete(null);
    router.refresh();
  }

  // SOLD_OUT/ENDED — только сервер (см. pass-service.ts::syncPassLifecycle),
  // вручную из DRAFT/PAUSED/ACTIVE/ARCHIVED сюда не попасть и отсюда никуда
  // вручную не перейти — поэтому для этих двух статусов action-кнопки нет.
  function statusAction(pass: PassRow): { label: string; next: string; icon: React.ReactNode } | null {
    if (pass.status === "PAUSED" || pass.status === "DRAFT") return { label: "Активировать", next: "ACTIVE", icon: <PlayIcon /> };
    if (pass.status === "ACTIVE") return { label: "Пауза", next: "PAUSED", icon: <PauseIcon /> };
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="m-0 text-sm text-admin-muted">
          {passes.length} {pluralizeTypes(passes.length)} доступа для этого события.
        </p>
        <Button type="button" variant="admin" size="sm" onClick={() => setModal({ mode: "create" })}>
          Создать Pass
        </Button>
      </div>

      {error && <p className="m-0 text-sm text-red-400">{error}</p>}

      {passes.length === 0 ? (
        <p className="text-sm text-admin-muted">Pass для этого события ещё не созданы.</p>
      ) : (
        <div className="rounded-app border border-admin-border">
          {passes.map((pass) => {
            const total = pass.availableQuantity == null ? null : pass.soldQuantity + pass.availableQuantity;
            const pct = total ? Math.min(100, Math.round((pass.soldQuantity / total) * 100)) : null;
            const action = statusAction(pass);
            return (
              <div key={pass.id} className="flex items-center gap-3.5 border-b border-admin-border px-4 py-3 last:border-none">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-app-sm bg-admin-card2 text-base" aria-hidden="true">
                  🎫
                </span>
                <button type="button" onClick={() => setModal({ mode: "edit", pass })} className="min-w-0 flex-1 cursor-pointer text-left">
                  <span className="block truncate text-sm font-semibold text-night-text">{pass.name}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-admin-muted">
                    <span>{PASS_TYPE_LABELS[pass.type] ?? pass.type}</span>
                    <StatusBadge label={STATUS_LABELS[pass.status] ?? pass.status} variant={STATUS_VARIANTS[pass.status] ?? "neutral"} />
                  </span>
                </button>
                <span className="w-20 shrink-0 text-right text-sm font-bold tabular-nums text-night-text">
                  {pass.price == null ? "Бесплатно" : `${pass.price} ${pass.currency ?? ""}`}
                </span>
                <a href={`${registrationsPath}?pass=${pass.id}`} className="w-24 shrink-0 text-right text-xs text-admin-muted hover:text-admin-primaryHover hover:underline">
                  {pass.soldQuantity} / {total == null ? "∞" : total}
                  {pct != null && (
                    <span className="mt-1 block h-[5px] w-full overflow-hidden rounded-full bg-admin-card2">
                      <span className="block h-full bg-admin-primary" style={{ width: `${pct}%` }} />
                    </span>
                  )}
                </a>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    title="Изменить"
                    aria-label="Изменить Pass"
                    onClick={() => setModal({ mode: "edit", pass })}
                    className="inline-flex items-center justify-center rounded-app-sm p-1.5 text-admin-muted hover:bg-admin-card2 hover:text-night-text"
                  >
                    <PencilIcon />
                  </button>
                  {action && (
                    <button
                      type="button"
                      title={action.label}
                      aria-label={action.label}
                      disabled={loadingId === pass.id}
                      onClick={() => setStatus(pass.id, action.next)}
                      className="inline-flex items-center justify-center rounded-app-sm p-1.5 text-admin-muted hover:bg-admin-card2 hover:text-night-text disabled:opacity-50"
                    >
                      {action.icon}
                    </button>
                  )}
                  {pass.status !== "ARCHIVED" && (
                    <button
                      type="button"
                      title="Закрыть"
                      aria-label="Закрыть Pass"
                      disabled={loadingId === pass.id}
                      onClick={() => setStatus(pass.id, "ARCHIVED")}
                      className="inline-flex items-center justify-center rounded-app-sm p-1.5 text-admin-muted hover:bg-admin-card2 hover:text-night-text disabled:opacity-50"
                    >
                      <ArchiveBoxIcon />
                    </button>
                  )}
                  {pass.soldQuantity === 0 && (
                    <button
                      type="button"
                      title="Удалить"
                      aria-label="Удалить Pass"
                      disabled={loadingId === pass.id}
                      onClick={() => setConfirmingDelete(pass)}
                      className="inline-flex items-center justify-center rounded-app-sm p-1.5 text-admin-muted hover:bg-red-400/10 hover:text-red-400 disabled:opacity-50"
                    >
                      <TrashIcon />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <PassFormModal
          eventSlug={eventSlug}
          mode={modal.mode}
          initial={modal.pass}
          templates={templates}
          accessOptions={accessOptions}
          onClose={() => setModal(null)}
        />
      )}

      {confirmingDelete && (
        <ConfirmModal
          title="Удалить Pass?"
          message={`«${confirmingDelete.name}» будет удалён безвозвратно — это действие нельзя отменить.`}
          confirmLabel="Удалить"
          danger
          pending={loadingId === confirmingDelete.id}
          onConfirm={() => deletePassPermanently(confirmingDelete)}
          onClose={() => setConfirmingDelete(null)}
        />
      )}
    </div>
  );
}
