"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

// Обложка фестиваля (перенос UI-прототипа, Stage F, 2026-09-20) —
// минимальное решение: одно фото (Festival.coverUrl), не полноценная
// галерея, как у Event.EventMedia. Модалка-дропзона — тот же приём, что и
// modal-cover в прототипе.
export function FestivalCoverUpload({ festivalId, coverUrl }: { festivalId: string; coverUrl: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/festivals/${festivalId}/cover`, { method: "POST", body: form });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.message ?? "Не удалось загрузить обложку.");
        return;
      }
      setOpen(false);
      router.refresh();
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <div className="relative flex h-[60px] w-24 shrink-0 items-center justify-center overflow-hidden rounded-app-sm bg-gradient-to-br from-[#1d2b52] to-[#241a30] text-xl">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span aria-hidden="true">🖼️</span>
        )}
      </div>
      <div>
        <Button type="button" variant="adminOutline" size="sm" onClick={() => setOpen(true)}>
          {coverUrl ? "Изменить фото" : "Загрузить фото"}
        </Button>
        <p className="m-0 mt-1 text-xs text-admin-muted">JPG/PNG/WEBP, до 10 МБ.</p>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5" onClick={() => !uploading && setOpen(false)} role="presentation">
          <div
            className="w-full max-w-[440px] overflow-hidden rounded-app border border-admin-border bg-admin-card shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cover-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-admin-border px-5 py-4">
              <h3 id="cover-modal-title" className="m-0 text-[15px] font-extrabold text-night-text">
                Обложка фестиваля
              </h3>
            </div>
            <div className="px-5 py-4">
              {error && <p className="m-0 mb-3 text-sm text-red-400">{error}</p>}
              <div
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) upload(file);
                }}
                className={`flex cursor-pointer flex-col items-center gap-2 rounded-app border-2 border-dashed px-6 py-10 text-center text-sm ${
                  dragOver ? "border-admin-primary text-night-text" : "border-admin-border text-admin-muted"
                }`}
              >
                <span className="text-2xl" aria-hidden="true">
                  🖼️
                </span>
                {uploading ? "Загрузка…" : "Перетащите файл сюда или нажмите, чтобы выбрать"}
                <span className="text-xs">JPG / PNG / WEBP / AVIF, до 10 МБ</span>
              </div>
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) upload(file);
                }}
              />
            </div>
            <div className="flex justify-end gap-2 border-t border-admin-border px-5 py-4">
              <Button type="button" variant="adminOutline" onClick={() => setOpen(false)} disabled={uploading}>
                Закрыть
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
