import { Suspense } from "react";
import { BottomNav } from "@/components/compete/BottomNav";

// Тёмный "premium" раздел поверх обычного светлого сайта (по референсу
// пользователя, 2026-09-04) — только для /compete/**. Корневой layout
// (src/app/layout.tsx: светлый Header + <main class="container py-6">) не
// трогаем — оборачиваем содержимое собственным тёмным блоком с отступом,
// компенсирующим внешний контейнер, чтобы фон был во всю ширину на мобильном.
export default function CompeteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="-mx-4 -my-6 min-h-[70vh] bg-night-bg px-4 pb-24 pt-4 text-night-text sm:mx-0 sm:my-0 sm:rounded-app sm:px-6 sm:py-6">
      {children}
      <Suspense fallback={null}>
        <BottomNav />
      </Suspense>
    </div>
  );
}
