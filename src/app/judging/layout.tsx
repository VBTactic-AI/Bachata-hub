// Тёмная тема судейского интерфейса по макету JBJ Platform (экраны "СУДЬЯ:
// ...", 06.09.2026) — mobile-first, без табов/шапки: судья не должен видеть
// ничего лишнего (CLAUDE.md §40). Тот же приём компенсирующих отступов, что
// и в src/app/compete/layout.tsx. Фон — bg-admin-bg, не night-bg (2026-09-10,
// по запросу пользователя — экран судьи перекрашен в admin-* палитру,
// см. tailwind.config.ts).
export default function JudgingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-[calc(50%-50vw)] -my-6 min-h-[100vh] bg-admin-bg px-4 py-5 font-night text-night-text sm:px-6">
      <div className="mx-auto max-w-[520px]">{children}</div>
    </div>
  );
}
