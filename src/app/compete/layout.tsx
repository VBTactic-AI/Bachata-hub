import { Suspense } from "react";
import { BottomNav } from "@/components/compete/BottomNav";
import { DarkTopNav } from "@/components/dark/DarkTopNav";

// Тёмный "premium" раздел поверх обычного светлого сайта (по референсу
// пользователя, 2026-09-04; палитра и DarkTopNav — по макету JBJ Platform,
// 06.09.2026) — только для /compete/**. Корневой layout (src/app/layout.tsx:
// светлый Header + <main class="container py-6">) не трогаем — оборачиваем
// содержимое собственным тёмным блоком с отступом, компенсирующим внешний
// контейнер, чтобы фон был во всю ширину. Светлый Header скрыт целиком
// (HeaderVisibility) — на десктопе его место занимает DarkTopNav, на
// мобильном BottomNav.
export default function CompeteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="-mx-4 -my-6 min-h-[100dvh] bg-night-bg font-night text-night-text sm:mx-0 sm:my-0 sm:min-h-[70vh]">
      <DarkTopNav />
      <div className="px-4 pb-24 pt-4 sm:mx-auto sm:max-w-[1240px] sm:px-8 sm:pb-12 sm:pt-8">{children}</div>
      <Suspense fallback={null}>
        <div className="sm:hidden">
          <BottomNav />
        </div>
      </Suspense>
    </div>
  );
}
