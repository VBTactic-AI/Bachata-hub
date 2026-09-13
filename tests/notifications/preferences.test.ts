import { describe, it, expect, vi, beforeEach } from "vitest";

const notificationPreferenceUpsert = vi.fn();
const notificationPreferenceFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    notificationPreference: {
      upsert: (...a: unknown[]) => notificationPreferenceUpsert(...a),
      findMany: (...a: unknown[]) => notificationPreferenceFindMany(...a),
    },
  },
}));

const { getOrCreateNotificationPreference, updateNotificationPreference, getPreferenceMap, DEFAULT_NOTIFICATION_PREFERENCE } =
  await import("@/server/notifications/preferences");

beforeEach(() => {
  notificationPreferenceUpsert.mockReset();
  notificationPreferenceFindMany.mockReset();
});

describe("getOrCreateNotificationPreference() — создаётся с дефолтами при первом обращении", () => {
  it("upsert с create=дефолты, update={} (не трогает уже существующую строку)", async () => {
    notificationPreferenceUpsert.mockResolvedValue({ userId: "u1", ...DEFAULT_NOTIFICATION_PREFERENCE });

    await getOrCreateNotificationPreference("u1");

    expect(notificationPreferenceUpsert).toHaveBeenCalledWith({
      where: { userId: "u1" },
      create: { userId: "u1", ...DEFAULT_NOTIFICATION_PREFERENCE },
      update: {},
    });
  });
});

describe("updateNotificationPreference() — частичный патч", () => {
  it("если строки ещё нет — create = дефолты + патч; update = только патч", async () => {
    notificationPreferenceUpsert.mockResolvedValue({ userId: "u1", notifyChanges: false });

    await updateNotificationPreference("u1", { notifyChanges: false });

    expect(notificationPreferenceUpsert).toHaveBeenCalledWith({
      where: { userId: "u1" },
      create: { userId: "u1", ...DEFAULT_NOTIFICATION_PREFERENCE, notifyChanges: false },
      update: { notifyChanges: false },
    });
  });
});

describe("getPreferenceMap() — только чтение, без побочной записи", () => {
  it("для пользователя без строки — дефолт из памяти, БЕЗ upsert/create", async () => {
    notificationPreferenceFindMany.mockResolvedValue([]);

    const map = await getPreferenceMap(["u1"]);

    expect(map.get("u1")).toEqual(DEFAULT_NOTIFICATION_PREFERENCE);
    expect(notificationPreferenceUpsert).not.toHaveBeenCalled();
  });

  it("для пользователя со строкой — реальные значения, не дефолт", async () => {
    notificationPreferenceFindMany.mockResolvedValue([{ userId: "u1", notifyChanges: false, channelsEnabled: ["EMAIL"] }]);

    const map = await getPreferenceMap(["u1", "u2"]);

    expect(map.get("u1")).toEqual({ userId: "u1", notifyChanges: false, channelsEnabled: ["EMAIL"] });
    expect(map.get("u2")).toEqual(DEFAULT_NOTIFICATION_PREFERENCE);
  });

  it("пустой список — пустой Map без запроса к БД", async () => {
    const map = await getPreferenceMap([]);

    expect(map.size).toBe(0);
    expect(notificationPreferenceFindMany).not.toHaveBeenCalled();
  });
});
