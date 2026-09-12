// Event Media Gallery — "не доверять только расширению файла" (задача §7):
// читаем реальные magic bytes и заголовок формата напрямую из буфера, без
// внешней зависимости (image-size/sharp и т.п. — CLAUDE.md §14, не добавлять
// зависимости без необходимости; форматов всего 4, у каждого простой и
// стабильный бинарный заголовок).

export type SniffedImageType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

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
  if (buf.length >= 6 && (buf.toString("ascii", 0, 6) === "GIF87a" || buf.toString("ascii", 0, 6) === "GIF89a")) return "image/gif";
  return null;
}

export function readImageDimensions(buf: Buffer, type: SniffedImageType): { width: number; height: number } | null {
  try {
    if (type === "image/png") {
      // IHDR chunk начинается сразу после 8-байтной сигнатуры + 4 (длина) + 4 ("IHDR")
      if (buf.length < 24) return null;
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    if (type === "image/gif") {
      if (buf.length < 10) return null;
      return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
    }
    if (type === "image/webp") {
      // VP8 (lossy) / VP8L (lossless) / VP8X (extended) — три разных суб-формата,
      // у каждого свой способ закодировать размер.
      const chunk = buf.toString("ascii", 12, 16);
      if (chunk === "VP8X" && buf.length >= 30) {
        const width = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
        const height = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
        return { width, height };
      }
      if (chunk === "VP8 " && buf.length >= 30) {
        return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
      }
      if (chunk === "VP8L" && buf.length >= 25) {
        const b0 = buf[21];
        const b1 = buf[22];
        const b2 = buf[23];
        const b3 = buf[24];
        const width = 1 + (((b1 & 0x3f) << 8) | b0);
        const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
        return { width, height };
      }
      return null;
    }
    if (type === "image/jpeg") {
      // Ищем SOF-маркер (0xC0-0xCF, кроме DHT/JPG/DAC) — там кодируются размеры.
      let offset = 2;
      while (offset < buf.length - 9) {
        if (buf[offset] !== 0xff) {
          offset++;
          continue;
        }
        const marker = buf[offset + 1];
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7) };
        }
        const segmentLength = buf.readUInt16BE(offset + 2);
        offset += 2 + segmentLength;
      }
      return null;
    }
  } catch {
    return null;
  }
  return null;
}
