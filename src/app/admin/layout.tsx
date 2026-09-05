import { getCurrentUser, isAdmin } from "@/lib/auth";
import { AdminSidebar } from "@/components/admin/AdminSidebar";

// Общая рамка для /admin/** — раньше каждая страница (competitions,
// round-stages, division-categories) рендерилась сама по себе без единого
// входа в раздел ("Панель управления" нигде не было, найдено пользователем
// 07.09.2026). Доступ по-прежнему проверяет каждая страница сама (getActor
// + redirect) — этот layout только добавляет навигацию, не решает права.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
      <AdminSidebar isAdminUser={isAdmin(user)} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
