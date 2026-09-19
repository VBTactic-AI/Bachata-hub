"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

// Общая модалка подтверждения (перенос UI-прототипа Festival Engine, Stage
// R3, 2026-09-19) — заменяет `window.confirm`/`window.alert` там, где по
// прямому запросу пользователя нужен единый модальный паттерн проекта (тот
// же оверлей, что и у ProgramItemFormModal/SponsorFormModal), а не системный
// диалог браузера. Пока используется только в Festival Engine — остальные
// разделы (например EventDeleteButton) намеренно не трогались, это не было
// частью задачи.
export function ConfirmModal({
  title,
  message,
  confirmLabel = "Подтвердить",
  cancelLabel = "Отмена",
  danger = false,
  pending = false,
  onConfirm,
  onClose,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !pending) onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, pending]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5" onClick={() => !pending && onClose()} role="presentation">
      <div
        className="w-full max-w-[420px] overflow-hidden rounded-app border border-admin-border bg-admin-card shadow-2xl"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-admin-border px-5 py-4">
          <h3 id="confirm-modal-title" className="m-0 text-[15px] font-extrabold text-night-text">
            {title}
          </h3>
        </div>
        <div className="px-5 py-4">
          <p className="m-0 whitespace-pre-line text-sm text-admin-muted">{message}</p>
        </div>
        <div className="flex justify-end gap-2 border-t border-admin-border px-5 py-4">
          <Button type="button" variant="adminOutline" onClick={onClose} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={danger ? "adminOutline" : "admin"}
            className={danger ? "border-red-400/50 bg-red-400/10 text-red-400 hover:bg-red-400/20" : undefined}
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? "Подождите…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
