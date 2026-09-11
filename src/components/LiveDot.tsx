import { cn } from "@/lib/cn";

// "Live Score Glow" — пульсирующий зелёный индикатор "сейчас идёт live"
// (2026-09-11, по прямому запросу пользователя: "везде, где есть в
// проекте"). Заменяет прежние точки на голом Tailwind `animate-pulse`
// (только прозрачность) — здесь дышащий цветной box-shadow + лёгкий scale
// (tailwind.config.ts, `live-glow`), заметно "дороже" на вид. Используется в
// FloorSpotlight ("Сейчас на паркете"), LiveBadge монитора оценок судей и
// активной вкладке категории в JudgeCategoryTabs.
export function LiveDot({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block h-2 w-2 shrink-0 animate-live-glow rounded-full bg-night-success motion-reduce:animate-none", className)}
    />
  );
}
