"use client";

import { usePathname } from "next/navigation";
import { isDarkRoute } from "@/lib/dark-routes";

// Светлый футер сайта (mt-12 + фон body) просвечивал светлой полосой под
// тёмными разделами — они теперь сами себе "вся страница" (свой фон,
// DarkTopNav/BottomNav), футер сайта там не нужен (найдено пользователем
// визуально, 07.09.2026). Та же логика, что и HeaderVisibility.
export function FooterVisibility({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (isDarkRoute(pathname)) return null;
  return <>{children}</>;
}
