import { Suspense } from "react";
import { BottomNavGate } from "@/components/compete/BottomNavGate";
import { DarkTopNav } from "@/components/dark/DarkTopNav";

// §7 ТЗ (Event Suggestions) — та же тёмная обёртка, что и /become-organizer
// (см. комментарий там про CLAUDE.md §64.2 — цвета только из night-*).
export default function SuggestEventLayout({ children }: { children: React.ReactNode }) {
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
