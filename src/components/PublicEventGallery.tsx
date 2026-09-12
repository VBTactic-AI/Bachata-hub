"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

export type PublicGalleryImage = { id: string; url: string; objectPosition: string; width: number | null; height: number | null };

// Event Media Gallery (задача §15) — hero (главная афиша) + сетка остальных
// фото, с полноэкранным просмотром (next/prev/close, стрелки на десктопе,
// свайп на мобильном). Без сторонней lightbox-библиотеки (CLAUDE.md §14).
//
// Upload/Compression/Cache задача §10 — hero НЕ обрезается в фиксированный
// aspect-ratio (в отличие от квадратных thumbnails ниже и карточек списка):
// афиша может быть вертикальной/квадратной/горизонтальной, показываем
// максимально близко к оригинальным пропорциям. next/image здесь работает в
// "intrinsic size" режиме (явные width/height из EventMedia, не fill) —
// именно поэтому реальные пиксельные размеры сохраняются в БД при загрузке.
export function PublicEventGallery({ images, title }: { images: PublicGalleryImage[]; title: string }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  useEffect(() => {
    if (openIndex === null) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenIndex(null);
      if (e.key === "ArrowLeft") setOpenIndex((i) => (i === null ? i : (i - 1 + images.length) % images.length));
      if (e.key === "ArrowRight") setOpenIndex((i) => (i === null ? i : (i + 1) % images.length));
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openIndex, images.length]);

  if (images.length === 0) return null;

  const [hero, ...rest] = images;

  return (
    <div className="flex flex-col gap-2.5">
      <Image
        src={hero.url}
        alt={title}
        width={hero.width ?? 1200}
        height={hero.height ?? 800}
        // priority — выше fold, грузится сразу, не lazy (задача §12).
        priority
        sizes="(max-width: 768px) 100vw, 800px"
        onClick={() => setOpenIndex(0)}
        className="h-auto max-h-[60vh] w-full cursor-zoom-in rounded-app object-cover"
        style={{ objectPosition: hero.objectPosition }}
      />

      {rest.length > 0 && (
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {rest.map((img, i) => (
            <div key={img.id} className="relative aspect-square w-full overflow-hidden rounded-app-sm">
              {/* Остальные фото — ленивая загрузка по умолчанию (next/image), задача §12 */}
              <Image
                src={img.url}
                alt=""
                fill
                sizes="150px"
                onClick={() => setOpenIndex(i + 1)}
                className="cursor-zoom-in object-cover"
                style={{ objectPosition: img.objectPosition }}
              />
            </div>
          ))}
        </div>
      )}

      {openIndex !== null && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-4"
          onClick={() => setOpenIndex(null)}
          onTouchStart={(e) => setTouchStartX(e.touches[0].clientX)}
          onTouchEnd={(e) => {
            if (touchStartX === null) return;
            const delta = e.changedTouches[0].clientX - touchStartX;
            if (delta > 50) setOpenIndex((i) => (i === null ? i : (i - 1 + images.length) % images.length));
            else if (delta < -50) setOpenIndex((i) => (i === null ? i : (i + 1) % images.length));
            setTouchStartX(null);
          }}
        >
          {/* Полноэкранный просмотр — размер экрана заранее не известен,
              обычный img тут уместнее next/image (нет фиксированного intrinsic
              контейнера под lightbox). */}
          <img
            src={images[openIndex].url}
            alt=""
            className="max-h-[80vh] max-w-full rounded-app object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <div className="mt-4 flex items-center gap-6 text-white" onClick={(e) => e.stopPropagation()}>
            {images.length > 1 && (
              <button type="button" onClick={() => setOpenIndex((openIndex - 1 + images.length) % images.length)} aria-label="Предыдущее фото">
                ←
              </button>
            )}
            <span className="text-sm text-white/70">
              {openIndex + 1} / {images.length}
            </span>
            <button type="button" onClick={() => setOpenIndex(null)} aria-label="Закрыть">
              ✕
            </button>
            {images.length > 1 && (
              <button type="button" onClick={() => setOpenIndex((openIndex + 1) % images.length)} aria-label="Следующее фото">
                →
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
