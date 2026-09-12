// Event Media Gallery — "не доверять только расширению файла" (задача §7,
// §18 задачи Upload/Compression/Cache): дешёвая проверка magic bytes ДО
// того, как файл вообще передаётся в sharp — отсекает заведомо не-изображения
// (включая SVG — он не матчит ни одну из сигнатур ниже, что и есть его
// отклонение "по умолчанию", без специального кода) без полного декодирования.
// Размеры (width/height) с задачи "Upload/Compression/Cache" (2026-09-12)
// больше не парсятся вручную здесь — их даёт sharp().metadata() в
// image-process.ts (точнее, сам учитывает EXIF-ориентацию, не дублирует эту
// логику второй раз).

// GIF сознательно НЕ входит в список (задача Upload/Compression/Cache §2 даёт
// точный список: JPEG/JPG/PNG/WebP/AVIF, без GIF) — и технически корректно:
// наш pipeline (image-process.ts) всегда перекодирует в статичный WebP-кадр,
// анимация GIF молча терялась бы при "сжатии", это была бы не оптимизация, а
// скрытая потеря функциональности.
export type SniffedImageType = "image/jpeg" | "image/png" | "image/webp" | "image/avif";

export function sniffImageType(buf: Buffer): SniffedImageType | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return "image/png";
  }
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  // AVIF/HEIF — ISOBMFF-контейнер: 4 байта размера бокса, "ftyp", затем
  // major brand. "avif"/"avis" — неподвижное изображение / последовательность.
  if (buf.length >= 12 && buf.toString("ascii", 4, 8) === "ftyp") {
    const brand = buf.toString("ascii", 8, 12);
    if (brand === "avif" || brand === "avis") return "image/avif";
  }
  return null;
}
