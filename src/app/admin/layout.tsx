import { Suspense } from "react";
import { getCurrentUser, isAdmin, canCreateEvents } from "@/lib/auth";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminTopBar } from "@/components/admin/AdminTopBar";
import { BottomNavGate } from "@/components/compete/BottomNavGate";
import { JnjAmbientBackground } from "@/components/admin/JnjAmbientBackground";

// Тёмная тема для /admin/** по макету JBJ Platform (найдено пользователем
// 07.09.2026: админка оставалась светлой, когда весь остальной сайт уже
// тёмный). Доступ по-прежнему проверяет каждая страница сама (getActor +
// redirect) — этот layout только добавляет навигацию, не решает права.
//
// Redesign (2026-09-08): общесайтовый DarkTopNav (Календарь/Соревнования/
// Школы и т.д.) заменён на компактный AdminTopBar — референс не показывает
// публичную навигацию сайта внутри админки. Действия DarkTopNav (профиль,
// модерация, выход) не потеряны — перенесены в AdminTopBar как есть.
// AdminSidebar стал настоящей вертикальной боковой панелью (sticky,
// на всю высоту) вместо горизонтального списка ссылок над контентом.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  return (
    <div className="relative mx-[calc(50%-50vw)] -my-6 min-h-[100dvh] bg-admin-bg font-night text-night-text">
      <JnjAmbientBackground />
      {/* z-10 — тот же безопасный приём без отрицательных z-index, что и в
          фиксе фона главной страницы (src/app/page.tsx): весь настоящий
          контент в одном слое поверх декоративного фона (z-0). */}
      <div className="relative z-10 flex min-h-[100dvh] flex-col sm:flex-row">
        <AdminSidebar isAdminUser={isAdmin(user)} canManageContent={canCreateEvents(user)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <AdminTopBar />
          <main className="min-w-0 flex-1 px-4 pb-24 pt-5 sm:pb-12 sm:pl-2 sm:pr-8 sm:pt-7">
            <div className="mx-auto w-full max-w-[1400px]">{children}</div>
          </main>
        </div>
      </div>
      <Suspense fallback={null}>
        <div className="relative z-10 sm:hidden">
          <BottomNavGate />
        </div>
      </Suspense>
    </div>
  );
}
