"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { isDarkRoute } from "@/lib/dark-routes";

// "Белая полоска" внизу экрана на мобильных на тёмных разделах (2026-09-19,
// по прямому запросу пользователя) — тот же класс бага, что и со светлым
// футером раньше (см. FooterVisibility.tsx, найдено пользователем визуально
// 07.09.2026): каждый тёмный раздел красит СВОЙ внутренний wrapper-div
// (bg-night-bg/bg-admin-bg, min-h-[100dvh]), а не <body> целиком — сама
// <body> остаётся на светлом bg-bg (globals.css, для светлых страниц вроде
// /register). На телефоне округление 100dvh (адресная строка сворачивается/
// разворачивается) и резиновый оверскролл (iOS) время от времени показывают
// на пару пикселей настоящий фон <body> из-под этого wrapper'а — светлой
// полосой по нижнему краю. Красим саму <body> в тон текущего раздела как
// подложку — снаружи не видно, даже если у wrapper'а на миг останется зазор.
export function BodyBackgroundSync() {
  const pathname = usePathname();

  useEffect(() => {
    // #080508 — night-bg (tailwind.config.ts), общий тёмный фон для всех
    // тёмных разделов; /admin использует чуть другой оттенок (admin-bg,
    // #05070d) для своего wrapper'а, но разница на паре пикселей подложки
    // незаметна — отдельная точность здесь не нужна.
    document.body.style.backgroundColor = isDarkRoute(pathname) ? "#080508" : "";
  }, [pathname]);

  return null;
}
