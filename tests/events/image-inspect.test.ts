import { describe, expect, it } from "vitest";
import { sniffImageType, readImageDimensions } from "@/server/events/image-inspect";

function pngBuffer(width: number, height: number): Buffer {
  const buf = Buffer.alloc(33);
  buf.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0); // signature
  buf.writeUInt32BE(13, 8); // IHDR chunk length
  buf.write("IHDR", 12, "ascii");
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

function gifBuffer(width: number, height: number): Buffer {
  const buf = Buffer.alloc(10);
  buf.write("GIF89a", 0, "ascii");
  buf.writeUInt16LE(width, 6);
  buf.writeUInt16LE(height, 8);
  return buf;
}

describe("sniffImageType — не доверяет расширению, только реальным байтам", () => {
  it("detects PNG by its 8-byte signature", () => {
    expect(sniffImageType(pngBuffer(100, 50))).toBe("image/png");
  });
  it("detects JPEG by FFD8FF", () => {
    expect(sniffImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe("image/jpeg");
  });
  it("detects GIF87a/GIF89a", () => {
    expect(sniffImageType(gifBuffer(10, 10))).toBe("image/gif");
  });
  it("detects WEBP by RIFF....WEBP", () => {
    const buf = Buffer.alloc(16);
    buf.write("RIFF", 0, "ascii");
    buf.write("WEBP", 8, "ascii");
    expect(sniffImageType(buf)).toBe("image/webp");
  });
  it("returns null for a renamed non-image file (e.g. a .txt pretending to be .jpg)", () => {
    expect(sniffImageType(Buffer.from("just some text pretending to be an image"))).toBeNull();
  });
});

describe("readImageDimensions", () => {
  it("reads PNG width/height from the IHDR chunk", () => {
    expect(readImageDimensions(pngBuffer(1200, 800), "image/png")).toEqual({ width: 1200, height: 800 });
  });
  it("reads GIF width/height (little-endian)", () => {
    expect(readImageDimensions(gifBuffer(320, 240), "image/gif")).toEqual({ width: 320, height: 240 });
  });
  it("returns null on a truncated/malformed buffer instead of throwing", () => {
    expect(readImageDimensions(Buffer.from([1, 2, 3]), "image/png")).toBeNull();
  });
});
