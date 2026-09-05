import { Suspense } from "react";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { BottomNav } from "@/components/compete/BottomNav";
import { DarkTopNav } from "@/components/dark/DarkTopNav";

// Тёмная тема для /admin/** по макету JBJ Platform (найдено пользователем
// 07.09.2026: админка оставалась светлой, когда весь остальной сайт уже
// тёмный) — тот же приём, что и в остальных разделах. Доступ по-прежнему
// проверяет каждая страница сама (getActor + redirect) — этот layout только
// добавляет навигацию, не решает права.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  return (
    <div className="mx-[calc(50%-50vw)] -my-6 min-h-[100dvh] bg-night-bg font-night text-night-text">
      <DarkTopNav />
      <div className="px-4 pb-24 pt-4 sm:mx-auto sm:max-w-[1240px] sm:px-8 sm:pb-12 sm:pt-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
          <AdminSidebar isAdminUser={isAdmin(user)} />
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </div>
      <Suspense fallback={null}>
        <div className="sm:hidden">
          <BottomNav />
        </div>
      </Suspense>
    </div>
  );
}
