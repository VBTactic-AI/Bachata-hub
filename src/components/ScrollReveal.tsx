"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

// Появление блока при прокрутке (2026-09-11, по прямому запросу
// пользователя): translateY(24px)→0 и opacity 0→1 через IntersectionObserver
// (дешевле scroll-события, срабатывает один раз на блок и отключается).
// `delay` (в секундах) — для последовательного появления нескольких блоков
// подряд ("с задержкой 0.2с для каждого следующего элемента").
export function ScrollReveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Без резких появлений для тех, кто попросил меньше движения на экране.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -60px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn(
        "transition-[opacity,transform] duration-700 ease-out",
        visible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0",
        className
      )}
      style={{ transitionDelay: `${delay}s` }}
    >
      {children}
    </div>
  );
}
