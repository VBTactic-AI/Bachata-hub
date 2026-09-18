"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge, type StatusBadgeVariant } from "@/components/admin/StatusBadge";
import { Button } from "@/components/ui/button";
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
  async function deletePassPermanently(passId: string, name: string) {
    if (!window.confirm(`Удалить Pass «${name}» безвозвратно? Это действие нельзя отменить.`)) return;
    setLoadingId(passId);
    setError(null);
    const res = await fetch(`/api/events/${eventSlug}/passes/${passId}`, { method: "DELETE" });
    setLoadingId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.message || data.error || "Не удалось удалить Pass.");
      return;
    }
    router.refresh();
  }

  const ACTION_CLASS = "text-xs text-admin-muted hover:text-night-text hover:underline disabled:cursor-not-allowed disabled:opacity-50";

  // SOLD_OUT/ENDED — только сервер (см. pass-service.ts::syncPassLifecycle),
  // вручную из DRAFT/PAUSED/ACTIVE/ARCHIVED сюда не попасть и отсюда никуда
  // вручную не перейти — поэтому для этих двух статусов action-кнопки нет.
  function statusActionLabel(pass: PassRow): { label: string; next: string } | null {
    if (pass.status === "PAUSED" || pass.status === "DRAFT") return { label: "Активировать", next: "ACTIVE" };
    if (pass.status === "ACTIVE") return { label: "Пауза", next: "PAUSED" };
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
        <div className="overflow-x-auto rounded-app border border-admin-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-admin-card2 text-xs font-semibold uppercase tracking-wide text-admin-disabled">
              <tr>
                <th className="px-3 py-2 font-semibold">Pass</th>
                <th className="px-3 py-2 text-right font-semibold">Цена</th>
                <th className="px-3 py-2 font-semibold">Продано / Доступно</th>
                <th className="px-3 py-2 font-semibold">Статус</th>
                <th className="px-3 py-2 text-right font-semibold">Действия</th>
              </tr>
            </thead>
            <tbody>
              {passes.map((pass) => (
                <tr key={pass.id} className="border-t border-admin-border hover:bg-admin-card2/50">
                  <td className="px-3 py-2 align-top">
                    <p className="m-0 font-medium text-night-text">{pass.name}</p>
                    <p className="m-0 text-xs text-admin-muted">{PASS_TYPE_LABELS[pass.type] ?? pass.type}</p>
                  </td>
                  <td className="px-3 py-2 align-top text-right tabular-nums text-night-text">
                    {pass.price == null ? "Бесплатно" : `${pass.price} ${pass.currency ?? ""}`}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <a href={`${registrationsPath}?pass=${pass.id}`} className="text-sm text-admin-primaryHover hover:underline">
                      {pass.soldQuantity} / {pass.availableQuantity == null ? "∞" : pass.soldQuantity + pass.availableQuantity}
                    </a>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <StatusBadge label={STATUS_LABELS[pass.status] ?? pass.status} variant={STATUS_VARIANTS[pass.status] ?? "neutral"} />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div className="flex flex-wrap justify-end gap-2">
                      <button type="button" className={ACTION_CLASS} onClick={() => setModal({ mode: "edit", pass })}>
                        Изменить
                      </button>
                      {statusActionLabel(pass) && (
                        <button
                          type="button"
                          disabled={loadingId === pass.id}
                          className={ACTION_CLASS}
                          onClick={() => setStatus(pass.id, statusActionLabel(pass)!.next)}
                        >
                          {statusActionLabel(pass)!.label}
                        </button>
                      )}
                      {pass.status !== "ARCHIVED" && (
                        <button
                          type="button"
                          disabled={loadingId === pass.id}
                          className={`${ACTION_CLASS} hover:text-red-400`}
                          onClick={() => setStatus(pass.id, "ARCHIVED")}
                        >
                          Закрыть
                        </button>
                      )}
                      {pass.soldQuantity === 0 && (
                        <button
                          type="button"
                          disabled={loadingId === pass.id}
                          className={`${ACTION_CLASS} hover:text-red-400`}
                          onClick={() => deletePassPermanently(pass.id, pass.name)}
                        >
                          Удалить
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
    </div>
  );
}
