import type { ReactNode } from "react";
import { AdminTopBar } from "@/components/admin/AdminTopBar";

// Общая раскладка "сайдбар + топбар + контент" для КАЖДОГО из пяти разделов
// админки (Мониторинг/Ивенты/Соревнования/Школа/Фестивали) — раньше это было
// прямо внутри одного общего src/app/admin/layout.tsx с ЕДИНЫМ AdminSidebar
// на всё; при разделении на пять отдельных админок (2026-09-14) каждый
// раздел получил свой узкий сайдбар (не видит чужие разделы) и свой
// layout.tsx под своим URL-префиксом, а эта раскладка вынесена сюда, чтобы
// не дублировать разметку топбара/паддингов в каждом из пяти layout.tsx.
// sidebar=null (используется хабом-пикером /admin) — просто топбар без
// боковой колонки, не отдельная ветка кода.
export function AdminSectionShell({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col sm:flex-row">
      {sidebar}
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminTopBar />
        <main className="min-w-0 flex-1 px-4 pb-24 pt-5 sm:pb-12 sm:pl-2 sm:pr-8 sm:pt-7">
          <div className="mx-auto w-full max-w-[1400px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
