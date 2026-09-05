import { Suspense } from "react";
import { BottomNav } from "@/components/compete/BottomNav";
import { DarkTopNav } from "@/components/dark/DarkTopNav";

// Тёмный "premium" раздел поверх обычного светлого сайта (по референсу
// пользователя, 2026-09-04; палитра и DarkTopNav — по макету JBJ Platform,
// 06.09.2026) — только для /compete/**. Корневой layout (src/app/layout.tsx:
// светлый Header + <main class="container py-6">) не трогаем — оборачиваем
// содержимое собственным тёмным блоком. mx-[calc(50%-50vw)] "вырывает" блок
// из центрированного max-w-[1040px] контейнера сайта на всю ширину экрана —
// на ЛЮБОМ размере (простого -mx-4 достаточно только пока viewport уже
// 1040px+32px, на широких десктопах контейнер сам ограничивает ширину, и
// блок раньше оставался узкой "коробкой" посередине, 06.09.2026). Светлый
// Header скрыт целиком (HeaderVisibility) — на десктопе его место занимает
// DarkTopNav, на мобильном BottomNav.
export default function CompeteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-[calc(50%-50vw)] -my-6 min-h-[100dvh] bg-night-bg font-night text-night-text">
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
