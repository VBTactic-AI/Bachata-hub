import { Suspense } from "react";
import { BottomNavGate } from "@/components/compete/BottomNavGate";
import { DarkTopNav } from "@/components/dark/DarkTopNav";

// Тёмная тема для /festivals/** — тот же паттерн, что и src/app/events/layout.tsx
// (Festival Engine, Stage UI-5, 2026-09-17).
export default function FestivalsLayout({ children }: { children: React.ReactNode }) {
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
