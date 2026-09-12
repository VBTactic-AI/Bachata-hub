import { describe, it, expect, vi, beforeEach } from "vitest";
import type { User } from "@prisma/client";

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
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    storage: { from: () => ({ remove: storageRemove }) },
  }),
}));

const { deleteEventMedia, setMainEventMedia, EventMediaValidationError } = await import("@/server/events/event-media-service");
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
