import { Suspense } from "react";
import { BottomNav } from "@/components/compete/BottomNav";
import { DarkTopNav } from "@/components/dark/DarkTopNav";

// Тёмная тема для /profile по макету JBJ Platform (06.09.2026) — тот же
// паттерн, что и src/app/compete/layout.tsx.
export default function ProfileLayout({ children }: { children: React.ReactNode }) {
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
