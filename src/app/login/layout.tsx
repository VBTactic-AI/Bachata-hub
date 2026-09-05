// Тёмная тема для /login по макету JBJ Platform (экран "ВХОД", 06.09.2026)
// — самостоятельный полноэкранный блок без табов/шапки (тот же приём
// компенсирующих отступов, что и src/app/compete/layout.tsx).
export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-[calc(50%-50vw)] -my-6 flex min-h-[85vh] items-center justify-center bg-night-bg px-4 py-10 font-night text-night-text">
      <div className="w-full max-w-[400px]">{children}</div>
    </div>
  );
}
