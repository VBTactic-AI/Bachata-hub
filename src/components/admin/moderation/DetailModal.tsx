"use client";

import { useEffect, useState, type ReactNode } from "react";

// Общая "карточка с информацией" по клику (модерация → события/заявки школ,
// 2026-09-12, по прямому запросу пользователя) — тот же оверлей-паттерн, что
// и у AddDrawHelperForm/AssignJudgeCategoriesModal, вынесен отдельно, т.к.
// это уже третье+четвёртое место с одинаковой разметкой попапа.
//
// trigger — обычный ReactNode (не render-prop-функция!): вызывающая сторона
// здесь — серверный компонент (page.tsx списка модерации), а React Server
// Components не может передать клиентскому компоненту голую функцию как
// проп (только сериализуемые данные и уже готовые элементы) — сама модалка
// оборачивает переданное содержимое в кликабельную кнопку.
export function DetailModal({ trigger, title, children }: { trigger: ReactNode; title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="block w-full text-left hover:opacity-90">
        {trigger}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5" onClick={() => setOpen(false)} role="presentation">
          <div
            className="flex max-h-[88vh] w-full max-w-[560px] flex-col overflow-hidden rounded-app border border-admin-border bg-admin-card shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="detail-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-admin-border px-5 py-4">
              <h3 id="detail-modal-title" className="m-0 text-[17px] font-extrabold text-night-text">
                {title}
              </h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Закрыть"
                className="shrink-0 text-lg leading-none text-admin-muted hover:text-night-text"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
          </div>
        </div>
      )}
    </>
  );
}
