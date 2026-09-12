"use client";

import { useRef, useState } from "react";
import { PlusIcon, TrashIcon } from "@/components/admin/icons";
import { cn } from "@/lib/cn";
import type { WizardMediaItem } from "./wizard-types";

// EVENT IMAGES (Event Media Gallery, задача 2026-09-12) — несколько
// изображений на событие, ровно одно главное (★ MAIN). Работает для
// PARTY/MASTERCLASS/CONTEST/любых будущих типов одинаково — блок общий,
// живёт в StepBasic, не завязан на конкретный EventTypeConfig.
//
// Доступен только когда draft.id уже есть (черновик хотя бы раз сохранён,
// см. EventWizard.tsx) — файлам нужен eventId для Storage-пути и RBAC-
// проверки владения; до этого в браузере хранить нечего кроме самого файла,
// а "спрятанный" ранний upload без владельца событий противоречил бы §21
// (сервер обязан проверять Event ownership на КАЖДОЙ операции).

// Клиентская проверка (задача Upload/Compression/Cache §2/§15
// "client-side preliminary validation") — только UX-подсказка, отсекает
// заведомо неверный выбор в системном file picker'е раньше отправки на
// сервер. Источник истины — magic-byte проверка на сервере
// (src/server/events/image-inspect.ts), эта проверка НЕ заменяет её.
const ACCEPT = "image/jpeg,image/png,image/webp,image/avif";
const MAX_SOURCE_SIZE = 10 * 1024 * 1024;

type PendingUpload = { key: string; name: string; progress: number; error: string | null };

type ConfirmState = { mediaId: string; mode: "choose" | "ask" };

function apiUrl(eventId: string, mediaId?: string) {
  return mediaId ? `/api/event-drafts/${eventId}/media/${mediaId}` : `/api/event-drafts/${eventId}/media`;
}

function uploadWithProgress(url: string, method: string, file: File, onProgress: (pct: number) => void): Promise<WizardMediaItem> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) resolve(body.media as WizardMediaItem);
        else reject(new Error(body.error || "Upload failed"));
      } catch {
        reject(new Error("Upload failed"));
      }
    };
    xhr.onerror = () => reject(new Error("Не удалось загрузить — проверьте соединение."));
    const form = new FormData();
    form.set("file", file);
    xhr.send(form);
  });
}

export function EventMediaManager({
  eventId,
  media,
  onChange,
}: {
  eventId: string | null;
  media: WizardMediaItem[];
  onChange: (media: WizardMediaItem[]) => void;
}) {
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [reorderError, setReorderError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<{ mediaId: string } | null>(null);
  const thumbRefs = useRef(new Map<string, HTMLDivElement>());

  const sorted = [...media].sort((a, b) => a.sortOrder - b.sortOrder);

  function addFiles(files: FileList | File[]) {
    if (!eventId) return;
    for (const file of Array.from(files)) {
      const key = `${file.name}-${crypto.randomUUID()}`;
      // Клиентская предварительная проверка (задача §2/§15) — только UX,
      // не заменяет серверную (magic bytes + повторный лимит на сервере).
      if (file.size > MAX_SOURCE_SIZE) {
        setPending((p) => [...p, { key, name: file.name, progress: 100, error: "Файл слишком большой. Максимальный размер — 10 MB." }]);
        continue;
      }
      setPending((p) => [...p, { key, name: file.name, progress: 0, error: null }]);
      uploadWithProgress(apiUrl(eventId), "POST", file, (pct) =>
        setPending((p) => p.map((u) => (u.key === key ? { ...u, progress: pct } : u)))
      )
        .then((newMedia) => {
          onChange([...media, newMedia]);
          setPending((p) => p.filter((u) => u.key !== key));
        })
        .catch((err: Error) => {
          setPending((p) => p.map((u) => (u.key === key ? { ...u, progress: 100, error: err.message } : u)));
        });
    }
  }

  function replaceFile(mediaId: string, file: File) {
    if (!eventId) return;
    const key = `replace-${mediaId}`;
    setPending((p) => [...p, { key, name: file.name, progress: 0, error: null }]);
    uploadWithProgress(apiUrl(eventId, mediaId), "PUT", file, (pct) =>
      setPending((p) => p.map((u) => (u.key === key ? { ...u, progress: pct } : u)))
    )
      .then((updated) => {
        onChange(media.map((m) => (m.id === mediaId ? updated : m)));
        setPending((p) => p.filter((u) => u.key !== key));
      })
      .catch((err: Error) => {
        setPending((p) => p.map((u) => (u.key === key ? { ...u, progress: 100, error: err.message } : u)));
      });
  }

  async function setMain(mediaId: string) {
    if (!eventId) return;
    await fetch(apiUrl(eventId, mediaId), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isMain: true }),
    });
    onChange(media.map((m) => ({ ...m, isMain: m.id === mediaId })));
  }

  async function doDelete(mediaId: string, newMainId?: string) {
    if (!eventId) return;
    const url = new URL(apiUrl(eventId, mediaId), window.location.origin);
    if (newMainId) url.searchParams.set("newMainId", newMainId);
    const res = await fetch(url.toString().replace(window.location.origin, ""), { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setReorderError(body?.error || "Не удалось удалить изображение.");
      setConfirm(null);
      return;
    }
    const remaining = media.filter((m) => m.id !== mediaId);
    if (newMainId) {
      onChange(remaining.map((m) => ({ ...m, isMain: m.id === newMainId })));
    } else {
      const deletedWasMain = media.find((m) => m.id === mediaId)?.isMain;
      if (deletedWasMain && remaining.length > 0) {
        const next = [...remaining].sort((a, b) => a.sortOrder - b.sortOrder)[0];
        onChange(remaining.map((m) => ({ ...m, isMain: m.id === next.id })));
      } else {
        onChange(remaining);
      }
    }
    setConfirm(null);
  }

  function requestDelete(mediaId: string) {
    const target = media.find((m) => m.id === mediaId);
    if (target?.isMain && media.length > 1) {
      setConfirm({ mediaId, mode: "ask" });
    } else {
      void doDelete(mediaId);
    }
  }

  // Перетаскивание — тот же Pointer Events паттерн, что и CategoryList.tsx
  // (без сторонней библиотеки, CLAUDE.md §14).
  function reorderOver(overId: string) {
    if (!draggingId || draggingId === overId) return;
    const ids = sorted.map((m) => m.id);
    const from = ids.indexOf(draggingId);
    const to = ids.indexOf(overId);
    if (from === -1 || to === -1) return;
    const next = [...sorted];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next.map((m, i) => ({ ...m, sortOrder: i })));
  }
  function onThumbPointerMove(e: React.PointerEvent) {
    if (!draggingId) return;
    for (const [id, el] of thumbRefs.current) {
      const rect = el.getBoundingClientRect();
      if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
        reorderOver(id);
        break;
      }
    }
  }
  async function onThumbPointerUp() {
    if (!draggingId || !eventId) {
      setDraggingId(null);
      return;
    }
    setDraggingId(null);
    setReorderError(null);
    const order = [...media].sort((a, b) => a.sortOrder - b.sortOrder).map((m) => m.id);
    const res = await fetch(`/api/event-drafts/${eventId}/media/reorder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order }),
    });
    if (!res.ok) setReorderError("Не удалось сохранить порядок изображений.");
  }

  if (!eventId) {
    return (
      <div className="rounded-app border border-dashed border-admin-border bg-admin-card2/40 p-6 text-center text-sm text-admin-muted">
        Сохраните черновик (заполните Location и Date&nbsp;&amp;&nbsp;Time и нажмите «Save draft»), чтобы загружать афиши.
      </div>
    );
  }

  const lightboxMedia = lightboxId ? sorted.find((m) => m.id === lightboxId) : null;
  const confirmTarget = confirm ? media.find((m) => m.id === confirm.mediaId) : null;

  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-sm font-semibold text-night-text">Event images</p>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-app border-2 border-dashed p-8 text-center transition duration-150 ease-out",
          dragOver ? "border-admin-primary bg-admin-primary/10" : "border-admin-border bg-admin-card2/40 hover:border-admin-primary/50"
        )}
      >
        <span className="text-2xl text-admin-primary" aria-hidden="true">
          <PlusIcon />
        </span>
        <p className="m-0 font-medium text-night-text">Upload event images</p>
        <p className="m-0 text-xs text-admin-muted">Drag &amp; drop or click to upload</p>
        <p className="m-0 text-xs text-admin-disabled">JPG • PNG • WEBP • AVIF — до 10 МБ, автоматически сжимается</p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {pending.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-app border border-admin-border bg-admin-card p-3 text-sm">
          {pending.map((u) => (
            <div key={u.key} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-night-text">{u.name}</span>
              {u.error ? (
                <span className="flex items-center gap-2 text-xs text-red-400">
                  Upload failed
                  <button
                    type="button"
                    className="text-admin-primary hover:underline"
                    onClick={() => setPending((p) => p.filter((x) => x.key !== u.key))}
                  >
                    ✕
                  </button>
                </span>
              ) : (
                <span className="text-xs text-admin-muted">{u.progress < 100 ? `${u.progress}%` : "✓"}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {reorderError && <p className="m-0 text-xs text-red-400">{reorderError}</p>}

      {sorted.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {sorted.map((m) => (
            <div
              key={m.id}
              ref={(el) => {
                if (el) thumbRefs.current.set(m.id, el);
                else thumbRefs.current.delete(m.id);
              }}
              className={cn(
                "group relative aspect-square overflow-hidden rounded-app-sm border bg-admin-card2 transition",
                draggingId === m.id ? "opacity-60" : "",
                m.isMain ? "border-admin-primary" : "border-admin-border"
              )}
            >
              <img
                src={m.url}
                alt=""
                onClick={() => setLightboxId(m.id)}
                className="h-full w-full cursor-zoom-in object-cover"
                style={{ objectPosition: m.objectPosition }}
              />
              {m.isMain && (
                <span className="absolute left-1.5 top-1.5 rounded-full bg-admin-primary px-2 py-0.5 text-[0.65rem] font-bold text-white">
                  ★ MAIN
                </span>
              )}

              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-black/70 px-1.5 py-1 opacity-0 transition group-hover:opacity-100">
                {!m.isMain && (
                  <button type="button" title="Set as main" onClick={() => setMain(m.id)} className="text-xs text-white hover:text-admin-primary">
                    ★
                  </button>
                )}
                <button
                  type="button"
                  title="Replace"
                  onClick={() => {
                    replaceInputRef.current = { mediaId: m.id };
                    document.getElementById(`replace-input-${m.id}`)?.click();
                  }}
                  className="text-xs text-white hover:text-admin-primary"
                >
                  ⟲
                </button>
                <button
                  type="button"
                  title="Delete"
                  onClick={() => requestDelete(m.id)}
                  className="text-white hover:text-red-400"
                >
                  <TrashIcon />
                </button>
                <button
                  type="button"
                  title="Drag to reorder"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    (e.target as Element).releasePointerCapture?.(e.pointerId);
                    setDraggingId(m.id);
                  }}
                  onPointerMove={onThumbPointerMove}
                  onPointerUp={onThumbPointerUp}
                  onPointerCancel={onThumbPointerUp}
                  className="cursor-grab touch-none select-none text-xs text-white hover:text-admin-primary active:cursor-grabbing"
                >
                  ⠿
                </button>
              </div>

              <input
                id={`replace-input-${m.id}`}
                type="file"
                accept={ACCEPT}
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) replaceFile(m.id, file);
                  e.target.value = "";
                }}
              />
            </div>
          ))}
        </div>
      )}

      {/* Confirm — удаление MAIN, когда есть другие фото (задача §14) */}
      {confirm && confirmTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5" onClick={() => setConfirm(null)}>
          <div
            className="w-full max-w-[420px] rounded-app border border-admin-border bg-admin-card p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {confirm.mode === "ask" ? (
              <>
                <h3 className="m-0 text-base font-bold text-night-text">Delete main image?</h3>
                <p className="m-0 mt-2 text-sm text-admin-muted">
                  This image is currently used as the event cover. Choose another main image before deleting it.
                </p>
                <div className="mt-4 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirm({ mediaId: confirm.mediaId, mode: "choose" })}
                    className="rounded-app-sm bg-admin-primary px-3 py-2 text-sm font-semibold text-white hover:brightness-110"
                  >
                    Choose another cover
                  </button>
                  <button
                    type="button"
                    onClick={() => void doDelete(confirm.mediaId)}
                    className="rounded-app-sm border border-red-400/50 px-3 py-2 text-sm font-semibold text-red-400 hover:bg-red-400/10"
                  >
                    Delete anyway
                  </button>
                  <button type="button" onClick={() => setConfirm(null)} className="rounded-app-sm px-3 py-2 text-sm text-admin-muted hover:text-night-text">
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="m-0 text-base font-bold text-night-text">Choose a new main image</h3>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {media
                    .filter((m) => m.id !== confirm.mediaId)
                    .map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => void doDelete(confirm.mediaId, m.id)}
                        className="aspect-square overflow-hidden rounded-app-sm border border-admin-border hover:border-admin-primary"
                      >
                        <img src={m.url} alt="" className="h-full w-full object-cover" />
                      </button>
                    ))}
                </div>
                <button type="button" onClick={() => setConfirm(null)} className="mt-4 text-sm text-admin-muted hover:text-night-text">
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Lightbox — просмотр в полном размере, с навигацией */}
      {lightboxMedia && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-5"
          onClick={() => setLightboxId(null)}
        >
          <img src={lightboxMedia.url} alt="" className="max-h-[80vh] max-w-full rounded-app object-contain" onClick={(e) => e.stopPropagation()} />
          <div className="mt-4 flex items-center gap-6 text-white" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => {
                const idx = sorted.findIndex((m) => m.id === lightboxMedia.id);
                setLightboxId(sorted[(idx - 1 + sorted.length) % sorted.length].id);
              }}
            >
              ← Prev
            </button>
            <button type="button" onClick={() => setLightboxId(null)}>
              Close
            </button>
            <button
              type="button"
              onClick={() => {
                const idx = sorted.findIndex((m) => m.id === lightboxMedia.id);
                setLightboxId(sorted[(idx + 1) % sorted.length].id);
              }}
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
