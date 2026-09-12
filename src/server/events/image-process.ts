import sharp from "sharp";

// Upload/Compression/Cache задача (2026-09-12) — единственное место, где
// исходник превращается в то, что реально ляжет в Storage. Все Event-
// изображения (и "афиша", и обычное фото галереи) обрабатываются ОДНИМ
// профилем — профилем "афиши" из задачи (max 2400px, quality 82-85):
// в текущем UI нет отдельного действия "загрузить именно афишу" отдельно от
// "загрузить обычное фото" — это один и тот же Event Media Gallery
// (src/components/admin/events/EventMediaManager.tsx), а какая из фотографий
// главная (isMain) решается ПОСЛЕ загрузки и может меняться в любой момент
// ("Set as main") — реобрабатывать/перекодировать файл только из-за смены
// isMain означало бы лишнюю работу и (что важнее) новый URL для уже
// закэшированного клиентами файла без реальной причины (противоречит §8/§9
// задачи о неизменяемых версионированных URL). Поэтому берём более щедрый
// профиль ("афиша") для всех — это не ухудшает обычные фото, только чуть
// крупнее по размеру, чем "обычные 2000px" могли бы быть.
const MAX_DIMENSION = 2400;
const WEBP_QUALITY = 84; // середина диапазона 82-85 из задачи

export type ProcessedImage = {
  buffer: Buffer;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
};

export class ImageProcessingError extends Error {}

export async function processEventImage(input: Buffer): Promise<ProcessedImage> {
  let originalWidth = 0;
  let originalHeight = 0;
  let buffer: Buffer;
  let width = 0;
  let height = 0;

  try {
    const rawMeta = await sharp(input).metadata();
    originalWidth = rawMeta.width ?? 0;
    originalHeight = rawMeta.height ?? 0;

    // .rotate() без аргументов — авто-поворот по EXIF Orientation, затем сам
    // EXIF стирается из результата (задача §4 "корректно обрабатывать EXIF
    // orientation"). withoutEnlargement: true — задача §4/§10: никогда не
    // увеличивать маленькие изображения, только уменьшать. fit: "inside"
    // сохраняет aspect ratio.
    buffer = await sharp(input)
      .rotate()
      .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();

    const outMeta = await sharp(buffer).metadata();
    width = outMeta.width ?? 0;
    height = outMeta.height ?? 0;
  } catch (err) {
    throw new ImageProcessingError(err instanceof Error ? err.message : "image processing failed");
  }

  return { buffer, width, height, originalWidth, originalHeight };
}
