import { Suspense } from "react";
import { BottomNavGate } from "@/components/compete/BottomNavGate";
import { JnjAmbientBackground } from "@/components/admin/JnjAmbientBackground";

// Тёмная тема для /admin/** по макету JBJ Platform. Общий "внешний" слой для
// ВСЕХ пяти разделов админки (Мониторинг/Ивенты/Соревнования/Школа/
// Фестивали, 2026-09-14) — только декоративный фон и мобильный BottomNav.
// Сайдбар и топбар раньше жили здесь одним общим AdminSidebar на всё —
// теперь у каждого раздела свой узкий сайдбар в СВОЁМ layout.tsx
// (src/app/admin/{system,competitions,content,school,festival}/layout.tsx,
// через общую src/components/admin/AdminSectionShell.tsx), а хаб-пикер
// /admin вообще без сайдбара. Права по-прежнему проверяет каждый layout/
// страница сама — этот layout ничего не решает.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative mx-[calc(50%-50vw)] -my-6 min-h-[100dvh] bg-admin-bg font-night text-night-text">
      <JnjAmbientBackground />
      {/* z-10 — тот же безопасный приём без отрицательных z-index, что и в
          фиксе фона главной страницы (src/app/page.tsx): весь настоящий
          контент в одном слое поверх декоративного фона (z-0). */}
      <div className="relative z-10 flex min-h-[100dvh] flex-col">{children}</div>
      <Suspense fallback={null}>
        <div className="relative z-10 sm:hidden">
          <BottomNavGate />
        </div>
      </Suspense>
    </div>
  );
}
