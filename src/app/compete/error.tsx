"use client";

import { useEffect } from "react";

// Next.js error boundary для /compete/** — техническая причина в консоль
// (для отладки), пользователю — понятная фраза и кнопка "Повторить"
// (CLAUDE.md §46: не показывать сырую ошибку наружу).
export default function CompeteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
      <p className="m-0 text-night-text">Не удалось загрузить соревнования.</p>
      <button
        type="button"
        onClick={reset}
        className="rounded-full bg-gradient-night-cta px-5 py-2.5 text-sm font-semibold text-white"
      >
        Повторить
      </button>
    </div>
  );
}
