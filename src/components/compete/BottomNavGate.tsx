import { getActor } from "@/server/rbac/actor";
import { isJudgeOnlyActor } from "@/server/rbac/authorize";
import { BottomNav } from "./BottomNav";

// Обёртка-сервер-компонент над BottomNav (клиентский, из-за usePathname) —
// только она решает, показывать ли пункт "Управление" (см. BottomNav.tsx),
// той же проверкой hasCompetitionAccess, что и DarkTopNav.
//
// Раньше hasCompetitionAccess значило просто "залогинен" (!!user) — судья
// (роль, у которой в принципе нет ни одного права на /admin, см.
// isJudgeOnlyActor) видел кнопку "Управление", жал на неё и тут же
// отлетал редиректом на главную (/admin/page.tsx) — кнопка обещала то, чего
// не было (жалоба пользователя, 2026-09-10, продолжение фикса "судья не
// должен видеть Панель управления"). Показываем кнопку только тем, кого
// туда реально пускают.
export async function BottomNavGate() {
  const actor = await getActor();
  return <BottomNav hasCompetitionAccess={!!actor && !isJudgeOnlyActor(actor)} />;
}
