import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { processEventImage, ImageProcessingError } from "@/server/events/image-process";

async function makeJpeg(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 40, b: 120 } } })
    .jpeg()
    .toBuffer();
}

describe("processEventImage — задача Upload/Compression/Cache", () => {
  it("shrinks a large image down to the 2400px cap while preserving aspect ratio (§4/§9)", async () => {
    const input = await makeJpeg(4000, 3000); // 4:3
    const result = await processEventImage(input);
    expect(result.width).toBeLessThanOrEqual(2400);
    expect(result.height).toBeLessThanOrEqual(2400);
    expect(result.width).toBe(2400);
    expect(result.height).toBe(1800); // 4:3 сохранено
    expect(result.originalWidth).toBe(4000);
    expect(result.originalHeight).toBe(3000);
  });

  it("NEVER upscales a small image (§4/§10 — withoutEnlargement)", async () => {
    const input = await makeJpeg(600, 400);
    const result = await processEventImage(input);
    expect(result.width).toBe(600);
    expect(result.height).toBe(400);
  });

  it("outputs real WebP bytes, not just a renamed JPEG (§5)", async () => {
    const input = await makeJpeg(800, 600);
    const result = await processEventImage(input);
    const meta = await sharp(result.buffer).metadata();
    expect(meta.format).toBe("webp");
  });

  it("actually reduces file size for a compressible image", async () => {
    const input = await makeJpeg(3000, 2000);
    const result = await processEventImage(input);
    expect(result.buffer.byteLength).toBeLessThan(input.byteLength);
  });

  it("auto-rotates by EXIF orientation and strips it from the output (§4)", async () => {
    // Кодируем 100x50 (широкое) с EXIF Orientation=6 (повернуть на 90° при
    // показе) — после .rotate() итоговые физические пиксели должны стать
    // 50x100 (высокое), а не остаться 100x50.
    const base = await sharp({ create: { width: 100, height: 50, channels: 3, background: { r: 10, g: 10, b: 10 } } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();

    const result = await processEventImage(base);
    expect(result.width).toBe(50);
    expect(result.height).toBe(100);

    const outMeta = await sharp(result.buffer).metadata();
    expect(outMeta.orientation).toBeUndefined(); // EXIF не перенесён в результат
  });

  it("is deterministic for identical input (нужно для дедупликации по хэшу, §20)", async () => {
    const input = await makeJpeg(1200, 900);
    const a = await processEventImage(input);
    const b = await processEventImage(input);
    expect(a.buffer.equals(b.buffer)).toBe(true);
  });

  it("throws ImageProcessingError for a corrupted/undecodable buffer", async () => {
    const garbage = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01, 0x02, 0x03]);
    await expect(processEventImage(garbage)).rejects.toBeInstanceOf(ImageProcessingError);
  });
});
