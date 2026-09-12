import { createHash } from "node:crypto";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";
import { sniffImageType } from "./image-inspect";
import { processEventImage, ImageProcessingError } from "./image-process";
import { EventForbiddenError, EventNotFoundError } from "./event-service";

// Event Media Gallery + Upload/Compression/Cache (задачи 2026-09-12) —
// множественные изображения на Event, ровно одно isMain = true. Единая
// сущность EventMedia — не разводим "Event.coverImage" и "Event.images[]" на
// две независимые системы одного файла (см. комментарий у модели в
// schema.prisma). Загрузка — только через сервер (service-role Storage
// клиент) после RBAC/ownership-проверки здесь, не прямой upload из браузера.
//
// Pipeline: UPLOAD -> VALIDATION (magic bytes, размер) -> COMPRESSION/RESIZE
// (sharp, image-process.ts, EXIF-safe, никогда не увеличивает) -> WEBP ->
// STORAGE (immutable Cache-Control) -> Prisma. Оригинал НЕ сохраняется —
// только обработанный файл (задача §6); "originalSize" в БД — чисто
// информационная метрика эффективности сжатия, не ссылка на реальный файл.

const BUCKET = "event-images";
const MAX_SOURCE_SIZE = 10 * 1024 * 1024; // 10 МБ — лимит ИСХОДНИКА (задача §2), не финального файла
// immutable — безопасно ровно потому, что путь versioned (crypto.randomUUID()
// на каждую загрузку/замену, задача §8) — один и тот же URL никогда не
// начинает означать другой файл.
const CACHE_CONTROL = "31536000"; // секунд — Supabase Storage сама формирует Cache-Control-заголовок из этого значения
const OBJECT_POSITIONS = new Set(["center", "top", "bottom", "left", "right"]);

export type EventMediaErrorCode =
  | "FILE_TOO_LARGE"
  | "UNSUPPORTED_FORMAT"
  | "INVALID_FILE"
  | "IMAGE_PROCESSING_FAILED"
  | "STORAGE_UPLOAD_FAILED"
  | "DATABASE_SAVE_FAILED"
  | "VALIDATION_FAILED";

// Задача §17 — стабильный код для клиента/логов + понятное сообщение для
// пользователя (без технических деталей — они остаются в server logs через
// обычный throw/catch выше по стеку, не логируются здесь отдельно).
export class EventMediaValidationError extends Error {
  constructor(
    public code: EventMediaErrorCode,
    message: string
  ) {
    super(message);
  }
}

async function assertOwnership(eventId: string, user: User) {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw new EventNotFoundError();
  if (event.createdById !== user.id && user.role !== "ADMIN") throw new EventForbiddenError("forbidden");
  return event;
}

// Единственное место, которое пишет Event.photoUrl (денормализованный кэш
// текущей главной — комментарий у поля в schema.prisma).
async function syncMainPhotoUrl(eventId: string) {
  const main = await prisma.eventMedia.findFirst({ where: { eventId, isMain: true } });
  await prisma.event.update({ where: { id: eventId }, data: { photoUrl: main?.url ?? null } });
}

type PreparedUpload = {
  buffer: Buffer;
  width: number;
  height: number;
  originalSize: number;
  contentHash: string;
};

// VALIDATION -> COMPRESSION -> RESIZE -> WEBP — вся обработка до Storage.
async function prepareUpload(file: File): Promise<PreparedUpload> {
  if (file.size > MAX_SOURCE_SIZE) {
    throw new EventMediaValidationError("FILE_TOO_LARGE", "Файл слишком большой. Максимальный размер — 10 MB.");
  }
  const originalBuffer = Buffer.from(await file.arrayBuffer());

  // "Не доверять только расширению файла" (задача §2/§18) — реальный тип
  // читаем из самих байтов, не из file.type (заголовок от браузера). SVG
  // отклоняется тем же путём — не матчит ни одну сигнатуру (задача §2).
  const sniffed = sniffImageType(originalBuffer);
  if (!sniffed) {
    throw new EventMediaValidationError(
      "UNSUPPORTED_FORMAT",
      "Неподдерживаемый файл. Разрешены форматы: JPEG, PNG, WebP, AVIF."
    );
  }

  let processed;
  try {
    processed = await processEventImage(originalBuffer);
  } catch (err) {
    if (err instanceof ImageProcessingError) {
      throw new EventMediaValidationError("IMAGE_PROCESSING_FAILED", "Не удалось обработать изображение.");
    }
    throw err;
  }

  const contentHash = createHash("sha256").update(processed.buffer).digest("hex");
  return { buffer: processed.buffer, width: processed.width, height: processed.height, originalSize: file.size, contentHash };
}

async function uploadToStorage(eventId: string, buffer: Buffer) {
  const storageKey = `events/${eventId}/${crypto.randomUUID()}.webp`;
  const admin = createAdminClient();
  const { error } = await admin.storage.from(BUCKET).upload(storageKey, buffer, {
    contentType: "image/webp",
    upsert: false,
    cacheControl: CACHE_CONTROL,
  });
  if (error) throw new EventMediaValidationError("STORAGE_UPLOAD_FAILED", "Не удалось загрузить файл. Попробуйте ещё раз.");
  const { data } = admin.storage.from(BUCKET).getPublicUrl(storageKey);
  return { storageKey, url: data.publicUrl };
}

export async function listEventMedia(eventId: string) {
  return prisma.eventMedia.findMany({ where: { eventId }, orderBy: { sortOrder: "asc" } });
}

export async function uploadEventMedia(eventId: string, user: User, file: File) {
  await assertOwnership(eventId, user);
  const prepared = await prepareUpload(file);

  // Задача §20 — дешёвая защита от случайной повторной загрузки того же
  // файла в то же событие: хэш обработанного файла совпал -> не грузим
  // повторно в Storage, отдаём уже существующую запись.
  const duplicate = await prisma.eventMedia.findFirst({ where: { eventId, contentHash: prepared.contentHash } });
  if (duplicate) return duplicate;

  const { storageKey, url } = await uploadToStorage(eventId, prepared.buffer);

  const existingCount = await prisma.eventMedia.count({ where: { eventId } });
  let media;
  try {
    media = await prisma.eventMedia.create({
      data: {
        eventId,
        url,
        storageKey,
        mimeType: "image/webp",
        fileSize: prepared.buffer.byteLength,
        originalSize: prepared.originalSize,
        contentHash: prepared.contentHash,
        width: prepared.width,
        height: prepared.height,
        originalName: file.name || null,
        sortOrder: existingCount,
        // Первая загруженная афиша сразу становится главной (задача §3) —
        // дальше переключается явным действием (setMainEventMedia), это НЕ
        // жёсткое правило "первая = главная" (задача §13 — не путать).
        isMain: existingCount === 0,
      },
    });
  } catch (err) {
    // БД не сохранила метаданные — файл в Storage уже есть и стал бы висячим
    // мусором молча; подчищаем за собой, чтобы не плодить объекты без строки.
    const admin = createAdminClient();
    await admin.storage.from(BUCKET).remove([storageKey]);
    throw new EventMediaValidationError("DATABASE_SAVE_FAILED", "Не удалось сохранить изображение.");
  }

  if (media.isMain) await syncMainPhotoUrl(eventId);
  return media;
}

export async function replaceEventMedia(eventId: string, mediaId: string, user: User, file: File) {
  await assertOwnership(eventId, user);
  const existing = await prisma.eventMedia.findUnique({ where: { id: mediaId } });
  if (!existing || existing.eventId !== eventId) throw new EventNotFoundError();

  const prepared = await prepareUpload(file);
  const { storageKey, url } = await uploadToStorage(eventId, prepared.buffer);

  let updated;
  try {
    updated = await prisma.eventMedia.update({
      where: { id: mediaId },
      data: {
        url,
        storageKey,
        mimeType: "image/webp",
        fileSize: prepared.buffer.byteLength,
        originalSize: prepared.originalSize,
        contentHash: prepared.contentHash,
        width: prepared.width,
        height: prepared.height,
        originalName: file.name || null,
      },
    });
  } catch (err) {
    const admin = createAdminClient();
    await admin.storage.from(BUCKET).remove([storageKey]);
    throw new EventMediaValidationError("DATABASE_SAVE_FAILED", "Не удалось сохранить изображение.");
  }

  // Задача §19 — сначала новый файл загружен и строка БД переключена на
  // него, СТАРЫЙ объект Storage удаляется только теперь: если что-то упало
  // раньше, старый файл остаётся рабочим, ничего не потеряно молча.
  const admin = createAdminClient();
  await admin.storage.from(BUCKET).remove([existing.storageKey]);

  if (updated.isMain) await syncMainPhotoUrl(eventId);
  return updated;
}

export async function setMainEventMedia(eventId: string, mediaId: string, user: User) {
  await assertOwnership(eventId, user);
  const media = await prisma.eventMedia.findUnique({ where: { id: mediaId } });
  if (!media || media.eventId !== eventId) throw new EventNotFoundError();

  // Задача §14 — атомарно: старая главная снимается и новая назначается в
  // одной транзакции, момента "две главных" или "ни одной" не существует.
  await prisma.$transaction([
    prisma.eventMedia.updateMany({ where: { eventId, isMain: true }, data: { isMain: false } }),
    prisma.eventMedia.update({ where: { id: mediaId }, data: { isMain: true } }),
  ]);
  await syncMainPhotoUrl(eventId);
}

export async function setEventMediaPosition(eventId: string, mediaId: string, user: User, objectPosition: string) {
  await assertOwnership(eventId, user);
  if (!OBJECT_POSITIONS.has(objectPosition)) throw new EventMediaValidationError("VALIDATION_FAILED", "invalid_position");
  const media = await prisma.eventMedia.findUnique({ where: { id: mediaId } });
  if (!media || media.eventId !== eventId) throw new EventNotFoundError();
  return prisma.eventMedia.update({ where: { id: mediaId }, data: { objectPosition } });
}

// Задача §12 — drag&drop сортировка. orderedIds — полный список id медиа
// события в желаемом порядке; sortOrder пересчитывается как позиция (0..N-1).
export async function reorderEventMedia(eventId: string, orderedIds: string[], user: User) {
  await assertOwnership(eventId, user);
  const existing = await prisma.eventMedia.findMany({ where: { eventId }, select: { id: true } });
  const existingIds = new Set(existing.map((m) => m.id));
  if (orderedIds.length !== existing.length || orderedIds.some((id) => !existingIds.has(id))) {
    throw new EventMediaValidationError("VALIDATION_FAILED", "invalid_order");
  }
  await prisma.$transaction(orderedIds.map((id, index) => prisma.eventMedia.update({ where: { id }, data: { sortOrder: index } })));
}

export async function deleteEventMedia(eventId: string, mediaId: string, user: User, opts: { newMainId?: string } = {}) {
  const event = await assertOwnership(eventId, user);
  const media = await prisma.eventMedia.findUnique({ where: { id: mediaId } });
  if (!media || media.eventId !== eventId) throw new EventNotFoundError();

  const siblingsCount = await prisma.eventMedia.count({ where: { eventId, id: { not: mediaId } } });

  // Задача §14 (Event Media Gallery) — не позволять опубликованному событию
  // остаться совсем без афиши (мягкая рекомендация задачи: "Лучше всего не
  // позволять..."). Не блокируем удаление НЕ-главных афиш и не блокируем
  // черновики — только "последняя афиша у уже опубликованного события".
  if (siblingsCount === 0 && event.status === "PUBLISHED" && event.moderationStatus === "APPROVED") {
    throw new EventMediaValidationError(
      "VALIDATION_FAILED",
      "Нельзя удалить единственную афишу у опубликованного события — сначала загрузите другую."
    );
  }

  if (opts.newMainId) {
    const candidate = await prisma.eventMedia.findUnique({ where: { id: opts.newMainId } });
    if (!candidate || candidate.eventId !== eventId || candidate.id === mediaId) {
      throw new EventMediaValidationError("VALIDATION_FAILED", "invalid_new_main");
    }
  }

  // Задача §19 (Upload/Compression/Cache) — удаление объекта Storage и
  // строки БД идут одной последовательностью в самом конце, после всех
  // проверок выше (не "сначала удалить, потом думать").
  const admin = createAdminClient();
  await admin.storage.from(BUCKET).remove([media.storageKey]);
  await prisma.eventMedia.delete({ where: { id: mediaId } });

  if (media.isMain) {
    if (opts.newMainId) {
      await prisma.eventMedia.update({ where: { id: opts.newMainId }, data: { isMain: true } });
    } else {
      // Без явного выбора ("Delete anyway") — предсказуемое, не случайное
      // повышение: следующая по sortOrder, не первая попавшаяся/по id.
      const next = await prisma.eventMedia.findFirst({ where: { eventId }, orderBy: { sortOrder: "asc" } });
      if (next) await prisma.eventMedia.update({ where: { id: next.id }, data: { isMain: true } });
    }
    await syncMainPhotoUrl(eventId);
  }
}
