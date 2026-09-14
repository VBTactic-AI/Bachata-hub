import { Suspense } from "react";
import { BottomNavGate } from "@/components/compete/BottomNavGate";
import { DarkTopNav } from "@/components/dark/DarkTopNav";

// Тёмная тема для /become-organizer — та же обёртка (bg-night-bg), что и у
// остальных тёмных разделов (см. src/app/profile/layout.tsx). Раньше её не
// было вовсе: страница использовала классы night-* (например, text-night-text
// — почти белый) поверх обычного светлого фона сайта по умолчанию, отсюда и
// нечитаемость (белый текст на белом) — тот же класс бага, что уже находили и
// чинили для /notifications (CLAUDE.md §64.2 требует брать цвета только из
// night-* — здесь они и были взяты, просто не на тёмном фоне).
export default function BecomeOrganizerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-[calc(50%-50vw)] -my-6 min-h-[100dvh] bg-night-bg font-night text-night-text">
      <DarkTopNav />
      <div className="px-4 pb-24 pt-4 sm:mx-auto sm:max-w-[1240px] sm:px-8 sm:pb-12 sm:pt-8">{children}</div>
      <Suspense fallback={null}>
        <div className="sm:hidden">
          <BottomNavGate />
        </div>
      </Suspense>
    </div>
  );
}
