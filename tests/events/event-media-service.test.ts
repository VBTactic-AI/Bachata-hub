import { describe, it, expect, vi, beforeEach } from "vitest";
import type { User } from "@prisma/client";
import sharp from "sharp";

async function makeJpegFile(width: number, height: number, name = "photo.jpg"): Promise<File> {
  const buf = await sharp({ create: { width, height, channels: 3, background: { r: 10, g: 200, b: 90 } } })
    .jpeg()
    .toBuffer();
  return new File([buf], name, { type: "image/jpeg" });
}

const eventFindUnique = vi.fn();
const eventUpdate = vi.fn();
const mediaFindUnique = vi.fn();
const mediaFindFirst = vi.fn();
const mediaCount = vi.fn();
const mediaCreate = vi.fn();
const mediaUpdate = vi.fn();
const mediaUpdateMany = vi.fn();
const mediaDelete = vi.fn();
const mediaFindMany = vi.fn();
const transaction = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    event: { findUnique: (...a: unknown[]) => eventFindUnique(...a), update: (...a: unknown[]) => eventUpdate(...a) },
    eventMedia: {
      findUnique: (...a: unknown[]) => mediaFindUnique(...a),
      findFirst: (...a: unknown[]) => mediaFindFirst(...a),
      findMany: (...a: unknown[]) => mediaFindMany(...a),
      count: (...a: unknown[]) => mediaCount(...a),
      create: (...a: unknown[]) => mediaCreate(...a),
      update: (...a: unknown[]) => mediaUpdate(...a),
      updateMany: (...a: unknown[]) => mediaUpdateMany(...a),
      delete: (...a: unknown[]) => mediaDelete(...a),
    },
    $transaction: (...a: unknown[]) => transaction(...a),
  },
}));

const storageRemove = vi.fn().mockResolvedValue({ error: null });
const storageUpload = vi.fn().mockResolvedValue({ error: null });
const storageGetPublicUrl = vi.fn((key: string) => ({ data: { publicUrl: `https://cdn.example/event-images/${key}` } }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    storage: { from: () => ({ remove: storageRemove, upload: storageUpload, getPublicUrl: storageGetPublicUrl }) },
  }),
}));

const { deleteEventMedia, setMainEventMedia, uploadEventMedia, EventMediaValidationError } = await import(
  "@/server/events/event-media-service"
);
const { EventForbiddenError, EventNotFoundError } = await import("@/server/events/event-service");

const owner: User = {
  id: "user-1",
  email: "o@example.com",
  passwordHash: null,
  supabaseUserId: null,
  role: "SCHOOL_REP",
  createdAt: new Date(),
  updatedAt: new Date(),
  lastLoginAt: null,
  isBlocked: false,
};

function makeEvent(overrides: Partial<{ createdById: string; status: string; moderationStatus: string }> = {}) {
  return {
    id: "event-1",
    createdById: "user-1",
    status: "DRAFT",
    moderationStatus: "PENDING",
    ...overrides,
  };
}

beforeEach(() => {
  eventFindUnique.mockReset();
  eventUpdate.mockReset().mockResolvedValue({});
  mediaFindUnique.mockReset();
  mediaFindFirst.mockReset();
  mediaFindMany.mockReset();
  mediaCount.mockReset();
  mediaCreate.mockReset();
  mediaUpdate.mockReset().mockResolvedValue({});
  mediaUpdateMany.mockReset().mockResolvedValue({});
  mediaDelete.mockReset().mockResolvedValue({});
  transaction.mockReset().mockImplementation((arg) => (Array.isArray(arg) ? Promise.all(arg) : arg()));
  storageRemove.mockClear();
  storageUpload.mockClear().mockResolvedValue({ error: null });
  storageGetPublicUrl.mockClear();
});

describe("deleteEventMedia — ownership", () => {
  it("refuses to delete media belonging to another user's event", async () => {
    eventFindUnique.mockResolvedValue(makeEvent({ createdById: "someone-else" }));
    await expect(deleteEventMedia("event-1", "media-1", owner)).rejects.toBeInstanceOf(EventForbiddenError);
  });

  it("throws EventNotFoundError for an unknown event", async () => {
    eventFindUnique.mockResolvedValue(null);
    await expect(deleteEventMedia("event-1", "media-1", owner)).rejects.toBeInstanceOf(EventNotFoundError);
  });
});

describe("deleteEventMedia — задача §14 (не оставлять опубликованное событие без афиши)", () => {
  it("blocks deleting the ONLY image of a published+approved event", async () => {
    eventFindUnique.mockResolvedValue(makeEvent({ status: "PUBLISHED", moderationStatus: "APPROVED" }));
    mediaFindUnique.mockResolvedValue({ id: "media-1", eventId: "event-1", isMain: true, storageKey: "k1" });
    mediaCount.mockResolvedValue(0); // no siblings

    await expect(deleteEventMedia("event-1", "media-1", owner)).rejects.toBeInstanceOf(EventMediaValidationError);
    expect(mediaDelete).not.toHaveBeenCalled();
    expect(storageRemove).not.toHaveBeenCalled();
  });

  it("allows deleting the only image of a DRAFT event (not yet published)", async () => {
    eventFindUnique.mockResolvedValue(makeEvent({ status: "DRAFT" }));
    mediaFindUnique.mockResolvedValue({ id: "media-1", eventId: "event-1", isMain: true, storageKey: "k1" });
    mediaCount.mockResolvedValue(0);
    mediaFindFirst.mockResolvedValue(null); // nothing left to promote

    await deleteEventMedia("event-1", "media-1", owner);
    expect(mediaDelete).toHaveBeenCalledWith({ where: { id: "media-1" } });
  });

  it("allows deleting a NON-main image even on a published event when others remain", async () => {
    eventFindUnique.mockResolvedValue(makeEvent({ status: "PUBLISHED", moderationStatus: "APPROVED" }));
    mediaFindUnique.mockResolvedValue({ id: "media-2", eventId: "event-1", isMain: false, storageKey: "k2" });
    mediaCount.mockResolvedValue(1); // one sibling remains

    await deleteEventMedia("event-1", "media-2", owner);
    expect(mediaDelete).toHaveBeenCalledWith({ where: { id: "media-2" } });
    expect(eventUpdate).not.toHaveBeenCalled(); // not main -> photoUrl untouched
  });
});

describe("deleteEventMedia — повышение новой главной афиши", () => {
  it("auto-promotes the next image by sortOrder when the main is deleted without an explicit choice", async () => {
    eventFindUnique.mockResolvedValue(makeEvent());
    mediaFindUnique.mockResolvedValue({ id: "media-1", eventId: "event-1", isMain: true, storageKey: "k1" });
    mediaCount.mockResolvedValue(2);
    mediaFindFirst.mockResolvedValue({ id: "media-2" }); // lowest remaining sortOrder

    await deleteEventMedia("event-1", "media-1", owner);

    expect(mediaUpdate).toHaveBeenCalledWith({ where: { id: "media-2" }, data: { isMain: true } });
    expect(eventUpdate).toHaveBeenCalled(); // syncMainPhotoUrl ran
  });

  it("honors an explicit newMainId ('Choose another cover') instead of auto-promoting", async () => {
    eventFindUnique.mockResolvedValue(makeEvent());
    mediaFindUnique
      .mockResolvedValueOnce({ id: "media-1", eventId: "event-1", isMain: true, storageKey: "k1" }) // the one being deleted
      .mockResolvedValueOnce({ id: "media-3", eventId: "event-1", isMain: false }); // candidate validation
    mediaCount.mockResolvedValue(2);
    mediaFindFirst.mockResolvedValue({ url: "https://cdn/example/media-3.jpg" }); // syncMainPhotoUrl lookup

    await deleteEventMedia("event-1", "media-1", owner, { newMainId: "media-3" });

    // Явный выбор применён напрямую — mediaUpdate НЕ вызывался с media-2
    // (соседом по умолчанию), только с явно выбранным media-3.
    expect(mediaUpdate).toHaveBeenCalledWith({ where: { id: "media-3" }, data: { isMain: true } });
    expect(mediaUpdate).toHaveBeenCalledTimes(1);
  });

  it("rejects a newMainId that doesn't belong to this event", async () => {
    eventFindUnique.mockResolvedValue(makeEvent());
    mediaFindUnique
      .mockResolvedValueOnce({ id: "media-1", eventId: "event-1", isMain: true, storageKey: "k1" })
      .mockResolvedValueOnce({ id: "media-x", eventId: "OTHER-event", isMain: false });
    mediaCount.mockResolvedValue(2);

    await expect(deleteEventMedia("event-1", "media-1", owner, { newMainId: "media-x" })).rejects.toBeInstanceOf(EventMediaValidationError);
  });
});

describe("setMainEventMedia", () => {
  it("atomically unsets the previous main and sets the new one, then syncs Event.photoUrl", async () => {
    eventFindUnique.mockResolvedValue(makeEvent());
    mediaFindUnique.mockResolvedValue({ id: "media-2", eventId: "event-1" });
    mediaFindFirst.mockResolvedValue({ url: "https://cdn/example/media-2.jpg" });

    await setMainEventMedia("event-1", "media-2", owner);

    expect(mediaUpdateMany).toHaveBeenCalledWith({ where: { eventId: "event-1", isMain: true }, data: { isMain: false } });
    expect(mediaUpdate).toHaveBeenCalledWith({ where: { id: "media-2" }, data: { isMain: true } });
    expect(eventUpdate).toHaveBeenCalledWith({ where: { id: "event-1" }, data: { photoUrl: "https://cdn/example/media-2.jpg" } });
  });
});

describe("uploadEventMedia — задача Upload/Compression/Cache", () => {
  it("rejects a source file over 10 MB with FILE_TOO_LARGE, before touching Storage/DB", async () => {
    eventFindUnique.mockResolvedValue(makeEvent());
    const oversized = new File([new Uint8Array(11 * 1024 * 1024)], "big.jpg", { type: "image/jpeg" });

    const err = await uploadEventMedia("event-1", owner, oversized).catch((e) => e);
    expect(err).toBeInstanceOf(EventMediaValidationError);
    expect(err.code).toBe("FILE_TOO_LARGE");
    expect(storageUpload).not.toHaveBeenCalled();
    expect(mediaCreate).not.toHaveBeenCalled();
  });

  it("rejects a file whose real bytes are not a supported image, regardless of its declared MIME type (UNSUPPORTED_FORMAT)", async () => {
    eventFindUnique.mockResolvedValue(makeEvent());
    // Заявленный type — image/jpeg, но реальные байты — просто текст:
    // ровно сценарий "не доверять только расширению/MIME от браузера" (§7/§18).
    const fake = new File([Buffer.from("not actually a jpeg")], "fake.jpg", { type: "image/jpeg" });

    const err = await uploadEventMedia("event-1", owner, fake).catch((e) => e);
    expect(err).toBeInstanceOf(EventMediaValidationError);
    expect(err.code).toBe("UNSUPPORTED_FORMAT");
    expect(storageUpload).not.toHaveBeenCalled();
  });

  it("uploads a real image as WebP with immutable Cache-Control, and stores original/optimized sizes", async () => {
    eventFindUnique.mockResolvedValue(makeEvent());
    mediaFindFirst.mockResolvedValueOnce(null); // dedup check: no existing match
    mediaCount.mockResolvedValue(0);
    mediaCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "new-media", ...data }));

    const file = await makeJpegFile(1600, 1200);
    const media = await uploadEventMedia("event-1", owner, file);

    expect(storageUpload).toHaveBeenCalledTimes(1);
    const [, , uploadOptions] = storageUpload.mock.calls[0];
    expect(uploadOptions).toMatchObject({ contentType: "image/webp", cacheControl: "31536000" });

    expect(mediaCreate).toHaveBeenCalledTimes(1);
    const created = mediaCreate.mock.calls[0][0].data;
    expect(created.mimeType).toBe("image/webp");
    expect(created.originalSize).toBe(file.size);
    expect(created.fileSize).toBeGreaterThan(0);
    expect(created.fileSize).toBeLessThan(created.originalSize); // реально сжалось
    expect(created.width).toBeLessThanOrEqual(2400);
    expect(created.isMain).toBe(true); // первая афиша события
    expect(media).toMatchObject({ id: "new-media" });
  });

  it("skips a redundant Storage upload when the exact same processed image was already added to this event (§20)", async () => {
    eventFindUnique.mockResolvedValue(makeEvent());
    const existingRow = { id: "already-here", eventId: "event-1", contentHash: "will-match" };
    mediaFindFirst.mockResolvedValueOnce(existingRow);

    const file = await makeJpegFile(800, 600);
    const result = await uploadEventMedia("event-1", owner, file);

    expect(result).toBe(existingRow);
    expect(storageUpload).not.toHaveBeenCalled();
    expect(mediaCreate).not.toHaveBeenCalled();
  });
});
