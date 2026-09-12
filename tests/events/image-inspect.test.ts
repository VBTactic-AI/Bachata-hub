import { describe, expect, it } from "vitest";
import { sniffImageType } from "@/server/events/image-inspect";

function pngBuffer(): Buffer {
  const buf = Buffer.alloc(33);
  buf.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  buf.writeUInt32BE(13, 8);
  buf.write("IHDR", 12, "ascii");
  return buf;
}

function avifBuffer(brand: "avif" | "avis" = "avif"): Buffer {
  const buf = Buffer.alloc(16);
  buf.writeUInt32BE(0x1c, 0); // box size (произвольное правдоподобное значение)
  buf.write("ftyp", 4, "ascii");
  buf.write(brand, 8, "ascii");
  return buf;
}

describe("sniffImageType — не доверяет расширению, только реальным байтам (задача §2/§7/§18)", () => {
  it("detects PNG by its 8-byte signature", () => {
    expect(sniffImageType(pngBuffer())).toBe("image/png");
  });
  it("detects JPEG by FFD8FF", () => {
    expect(sniffImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe("image/jpeg");
  });
  it("rejects GIF — not in the задача's allowed list (JPEG/PNG/WebP/AVIF only)", () => {
    const buf = Buffer.alloc(10);
    buf.write("GIF89a", 0, "ascii");
    expect(sniffImageType(buf)).toBeNull();
  });
  it("detects WEBP by RIFF....WEBP", () => {
    const buf = Buffer.alloc(16);
    buf.write("RIFF", 0, "ascii");
    buf.write("WEBP", 8, "ascii");
    expect(sniffImageType(buf)).toBe("image/webp");
  });
  it("detects AVIF still images (major brand 'avif')", () => {
    expect(sniffImageType(avifBuffer("avif"))).toBe("image/avif");
  });
  it("detects AVIF image sequences (major brand 'avis')", () => {
    expect(sniffImageType(avifBuffer("avis"))).toBe("image/avif");
  });
  it("rejects SVG — no binary signature matches XML text, refused by default per задача §2", () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect(sniffImageType(svg)).toBeNull();
  });
  it("returns null for a renamed non-image file (e.g. a .txt pretending to be .jpg)", () => {
    expect(sniffImageType(Buffer.from("just some text pretending to be an image"))).toBeNull();
  });
  it("does not confuse an unrelated ISOBMFF brand (e.g. mp4) with AVIF", () => {
    const buf = Buffer.alloc(16);
    buf.writeUInt32BE(0x1c, 0);
    buf.write("ftyp", 4, "ascii");
    buf.write("isom", 8, "ascii");
    expect(sniffImageType(buf)).toBeNull();
  });
});
