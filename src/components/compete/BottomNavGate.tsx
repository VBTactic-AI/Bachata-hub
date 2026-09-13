import { getActor } from "@/server/rbac/actor";
import { hasNoAdminAccess } from "@/server/rbac/authorize";
import { BottomNav } from "./BottomNav";

// Обёртка-сервер-компонент над BottomNav (клиентский, из-за usePathname) —
// только она решает, показывать ли пункт "Управление" (см. BottomNav.tsx),
// той же проверкой hasCompetitionAccess, что и DarkTopNav.
//
// Раньше hasCompetitionAccess значило просто "залогинен" (!!user), потом —
// "не только судья" (isJudgeOnlyActor) — но рядовой зарегистрированный
// участник (и вообще пользователь без единой роли в движке) всё ещё видел
// кнопку "Управление" и попадал на почти пустую страницу /admin (жалоба
// пользователя, 2026-09-10 и 2026-09-13, продолжение фикса "судья не должен
// видеть Панель управления"). Показываем кнопку только тем, у кого есть
// хоть какое-то реальное административное/организаторское право —
// hasNoAdminAccess.
export async function BottomNavGate() {
  const actor = await getActor();
  return <BottomNav hasCompetitionAccess={!!actor && !hasNoAdminAccess(actor)} />;
}
