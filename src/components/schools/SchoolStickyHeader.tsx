"use client";

import { useEffect, useRef, useState } from "react";

// Компактная шапка школы, появляющаяся при скролле вниз (перенос дизайна
// публичной страницы школы, 2026-09-17) — IntersectionObserver за невидимым
// "часовым" элементом сразу под hero, а не фиксированный порог в пикселях:
// так шапка появляется в одной и той же точке независимо от высоты hero на
// разных экранах.
export function SchoolStickyHeader({ name, avatarLabel, ratingLabel }: { name: string; avatarLabel: string; ratingLabel: string | null }) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setShow(!entry.isIntersecting), { threshold: 0 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div ref={sentinelRef} aria-hidden="true" />
      <header
        className={`fixed inset-x-0 top-0 z-40 flex items-center gap-2.5 border-b border-night-border bg-night-bg px-4 py-2.5 transition-transform duration-200 ${
          show ? "translate-y-0" : "-translate-y-full"
        }`}
        style={{ paddingTop: "calc(0.625rem + env(safe-area-inset-top, 0px))" }}
      >
        <div className="mx-auto flex w-full max-w-[1180px] items-center gap-2.5">
          <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-gradient-night-cta text-[13px] font-extrabold text-white">
            {avatarLabel}
          </div>
          <span className="flex-1 truncate text-sm font-bold text-night-text">{name}</span>
          {ratingLabel && <span className="shrink-0 text-[12.5px] font-extrabold text-night-pink">{ratingLabel}</span>}
        </div>
      </header>
    </>
  );
}
