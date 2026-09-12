import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";
import { sniffImageType, readImageDimensions } from "./image-inspect";
import { EventForbiddenError, EventNotFoundError } from "./event-service";

// Event Media Gallery (задача 2026-09-12) — множественные изображения на
// Event, ровно одно isMain = true. Единая сущность EventMedia — задача
// прямо требует не разводить "Event.coverImage" и "Event.images[]" как две
// независимые системы одного файла (см. комментарий у модели в
// schema.prisma). Загрузка — только через сервер (service-role Storage
// клиент) после RBAC/ownership-проверки здесь, не прямой upload из браузера.

const BUCKET = "event-images";
const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8 МБ — совпадает с лимитом бакета в Storage
const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};
const OBJECT_POSITIONS = new Set(["center", "top", "bottom", "left", "right"]);

export class EventMediaValidationError extends Error {
  constructor(message: string) {
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

async function inspectAndValidate(file: File): Promise<{ buffer: Buffer; mimeType: string; width?: number; height?: number }> {
  if (file.size > MAX_FILE_SIZE) {
    throw new EventMediaValidationError("Image is too large. Maximum size: 8 MB.");
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  // "Не доверять только расширению файла" (задача §7) — реальный тип читаем
  // из самих байтов, не из file.type (заголовок, который прислал браузер).
  const sniffed = sniffImageType(buffer);
  if (!sniffed) {
    throw new EventMediaValidationError("Unsupported file. Allowed formats: JPG, PNG, WEBP, GIF.");
  }
  const dims = readImageDimensions(buffer, sniffed);
  return { buffer, mimeType: sniffed, width: dims?.width, height: dims?.height };
}

async function uploadToStorage(eventId: string, mimeType: string, buffer: Buffer) {
  const storageKey = `events/${eventId}/${crypto.randomUUID()}.${EXT_BY_TYPE[mimeType]}`;
  const admin = createAdminClient();
  const { error } = await admin.storage.from(BUCKET).upload(storageKey, buffer, { contentType: mimeType, upsert: false });
  if (error) throw new EventMediaValidationError("Upload failed. Try again.");
  const { data } = admin.storage.from(BUCKET).getPublicUrl(storageKey);
  return { storageKey, url: data.publicUrl };
}

export async function listEventMedia(eventId: string) {
  return prisma.eventMedia.findMany({ where: { eventId }, orderBy: { sortOrder: "asc" } });
}

export async function uploadEventMedia(eventId: string, user: User, file: File) {
  await assertOwnership(eventId, user);
  const { buffer, mimeType, width, height } = await inspectAndValidate(file);
  const { storageKey, url } = await uploadToStorage(eventId, mimeType, buffer);

  const existingCount = await prisma.eventMedia.count({ where: { eventId } });
  const media = await prisma.eventMedia.create({
    data: {
      eventId,
      url,
      storageKey,
      mimeType,
      fileSize: file.size,
      width,
      height,
      originalName: file.name || null,
      sortOrder: existingCount,
      // Первая загруженная афиша сразу становится главной (задача §3) —
      // дальше переключается явным действием (setMainEventMedia), это НЕ
      // жёсткое правило "первая = главная" (задача §13 — не путать).
      isMain: existingCount === 0,
    },
  });

  if (media.isMain) await syncMainPhotoUrl(eventId);
  return media;
}

export async function replaceEventMedia(eventId: string, mediaId: string, user: User, file: File) {
  await assertOwnership(eventId, user);
  const existing = await prisma.eventMedia.findUnique({ where: { id: mediaId } });
  if (!existing || existing.eventId !== eventId) throw new EventNotFoundError();

  const { buffer, mimeType, width, height } = await inspectAndValidate(file);
  const { storageKey, url } = await uploadToStorage(eventId, mimeType, buffer);

  const updated = await prisma.eventMedia.update({
    where: { id: mediaId },
    data: { url, storageKey, mimeType, fileSize: file.size, width, height, originalName: file.name || null },
  });

  // Старый файл удаляем ПОСЛЕ успешной замены строки в БД — если что-то
  // упало раньше, старый объект остаётся рабочим, ничего не потеряно молча.
  const admin = createAdminClient();
  await admin.storage.from(BUCKET).remove([existing.storageKey]);

  if (updated.isMain) await syncMainPhotoUrl(eventId);
  return updated;
}

export async function setMainEventMedia(eventId: string, mediaId: string, user: User) {
  await assertOwnership(eventId, user);
  const media = await prisma.eventMedia.findUnique({ where: { id: mediaId } });
  if (!media || media.eventId !== eventId) throw new EventNotFoundError();

  await prisma.$transaction([
    prisma.eventMedia.updateMany({ where: { eventId, isMain: true }, data: { isMain: false } }),
    prisma.eventMedia.update({ where: { id: mediaId }, data: { isMain: true } }),
  ]);
  await syncMainPhotoUrl(eventId);
}

export async function setEventMediaPosition(eventId: string, mediaId: string, user: User, objectPosition: string) {
  await assertOwnership(eventId, user);
  if (!OBJECT_POSITIONS.has(objectPosition)) throw new EventMediaValidationError("invalid_position");
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
    throw new EventMediaValidationError("invalid_order");
  }
  await prisma.$transaction(orderedIds.map((id, index) => prisma.eventMedia.update({ where: { id }, data: { sortOrder: index } })));
}

export async function deleteEventMedia(eventId: string, mediaId: string, user: User, opts: { newMainId?: string } = {}) {
  const event = await assertOwnership(eventId, user);
  const media = await prisma.eventMedia.findUnique({ where: { id: mediaId } });
  if (!media || media.eventId !== eventId) throw new EventNotFoundError();

  const siblingsCount = await prisma.eventMedia.count({ where: { eventId, id: { not: mediaId } } });

  // Задача §14 — не позволять опубликованному событию остаться совсем без
  // афиши (мягкая рекомендация задачи: "Лучше всего не позволять..."). Не
  // блокируем удаление НЕ-главных афиш и не блокируем черновики — только
  // "последняя афиша у уже опубликованного события".
  if (siblingsCount === 0 && event.status === "PUBLISHED" && event.moderationStatus === "APPROVED") {
    throw new EventMediaValidationError(
      "Нельзя удалить единственную афишу у опубликованного события — сначала загрузите другую."
    );
  }

  if (opts.newMainId) {
    const candidate = await prisma.eventMedia.findUnique({ where: { id: opts.newMainId } });
    if (!candidate || candidate.eventId !== eventId || candidate.id === mediaId) {
      throw new EventMediaValidationError("invalid_new_main");
    }
  }

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
