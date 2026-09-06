import { getCurrentUser } from "@/lib/auth";
import { BottomNav } from "./BottomNav";

// Обёртка-сервер-компонент над BottomNav (клиентский, из-за usePathname) —
// только она решает, показывать ли пункт "Управление" (см. BottomNav.tsx),
// той же проверкой hasCompetitionAccess, что и DarkTopNav.
export async function BottomNavGate() {
  const user = await getCurrentUser();
  return <BottomNav hasCompetitionAccess={!!user} />;
}
