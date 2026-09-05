import { Suspense } from "react";
import { BottomNav } from "@/components/compete/BottomNav";
import { DarkTopNav } from "@/components/dark/DarkTopNav";

// Публичный профиль танцора (/dancers/[id]) переиспользует DancerProfileView
// с /profile — тёмная тема применена к обеим страницам одновременно
// (06.09.2026), тот же паттерн, что и src/app/compete/layout.tsx.
export default function DancersLayout({ children }: { children: React.ReactNode }) {
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
