// Тёмная тема судейского интерфейса по макету JBJ Platform (экраны "СУДЬЯ:
// ...", 06.09.2026) — mobile-first, без табов/шапки: судья не должен видеть
// ничего лишнего (CLAUDE.md §40). Тот же приём компенсирующих отступов, что
// и в src/app/compete/layout.tsx.
export default function JudgingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="-mx-4 -my-6 min-h-[100vh] bg-night-bg px-4 py-5 font-night text-night-text sm:mx-0 sm:my-0 sm:rounded-app sm:px-6">
      <div className="mx-auto max-w-[520px]">{children}</div>
    </div>
  );
}
