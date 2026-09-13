import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const notificationEndpointFindMany = vi.fn();
const notificationEndpointUpdate = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    notificationEndpoint: {
      findMany: (...a: unknown[]) => notificationEndpointFindMany(...a),
      update: (...a: unknown[]) => notificationEndpointUpdate(...a),
    },
  },
}));

const { webPushProvider } = await import("@/server/notifications/providers/web-push-provider");

// Реальная сгенерированная (Node crypto, не web-push пакет — см. комментарий
// в web-push-provider.ts) пара VAPID-ключей — валидный формат, JWT round-trip
// с jose уже проверен вручную при разработке.
const VAPID_PUBLIC_KEY = "BFbDb50uuiFoSBj69UzV4YdtfW7GHdRA_Zlu0SzJUO7LqCQ_5RzJEAK3S1f1wT6k1w2e73n95m7lTyloni3lEe8";
const VAPID_PRIVATE_KEY = "rYMtYhTXB2JOGWkbRCh8TkUvb0Sj01GAL29UF5BBt6U";

const ORIGINAL_ENV = { ...process.env };
const fetchMock = vi.fn();

beforeEach(() => {
  notificationEndpointFindMany.mockReset();
  notificationEndpointUpdate.mockReset().mockResolvedValue({});
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  process.env.VAPID_PUBLIC_KEY = VAPID_PUBLIC_KEY;
  process.env.VAPID_PRIVATE_KEY = VAPID_PRIVATE_KEY;
  process.env.VAPID_SUBJECT = "mailto:admin@bachatahub.by";
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...ORIGINAL_ENV };
});

const payload = { userId: "u1", title: "t", body: "b", deepLink: null };

describe("webPushProvider — VAPID JWT (jose) + fetch, без npm-пакета web-push", () => {
  it("нет активных endpoint'ов у пользователя — FAILED('no_endpoint'), fetch не вызывается", async () => {
    notificationEndpointFindMany.mockResolvedValue([]);

    const result = await webPushProvider.send(payload);

    expect(result).toEqual({ status: "FAILED", errorCode: "no_endpoint", errorMessage: "Нет активной подписки Web Push у этого пользователя." });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("успех — POST на endpoint с валидным VAPID Authorization-заголовком и TTL", async () => {
    notificationEndpointFindMany.mockResolvedValue([{ id: "ep1", endpoint: "https://fcm.googleapis.com/fcm/send/abc", enabled: true }]);
    fetchMock.mockResolvedValue({ ok: true, status: 201 });

    const result = await webPushProvider.send(payload);

    expect(result).toEqual({ status: "SENT" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://fcm.googleapis.com/fcm/send/abc",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ TTL: "86400", "Content-Length": "0" }),
      })
    );
    const authHeader = fetchMock.mock.calls[0][1].headers.Authorization as string;
    expect(authHeader).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=BFbDb50/);
  });

  it("VAPID-ключи не настроены — FAILED, endpoint не отключается (это не 410/404)", async () => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    notificationEndpointFindMany.mockResolvedValue([{ id: "ep1", endpoint: "https://fcm.googleapis.com/fcm/send/abc", enabled: true }]);

    const result = await webPushProvider.send(payload);

    expect(result.status).toBe("FAILED");
    expect(result.status === "FAILED" && result.errorMessage).toContain("VAPID-ключи не настроены");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(notificationEndpointUpdate).not.toHaveBeenCalled();
  });

  it("push-сервис вернул 410 Gone — endpoint отключается (enabled: false), не ретраится бесконечно на мёртвый адрес", async () => {
    notificationEndpointFindMany.mockResolvedValue([{ id: "ep1", endpoint: "https://fcm.googleapis.com/fcm/send/dead", enabled: true }]);
    fetchMock.mockResolvedValue({ ok: false, status: 410 });

    const result = await webPushProvider.send(payload);

    expect(result.status).toBe("FAILED");
    expect(notificationEndpointUpdate).toHaveBeenCalledWith({ where: { id: "ep1" }, data: { enabled: false } });
  });

  it("push-сервис вернул 500 (временный сбой) — endpoint НЕ отключается, обычный retry подхватит", async () => {
    notificationEndpointFindMany.mockResolvedValue([{ id: "ep1", endpoint: "https://fcm.googleapis.com/fcm/send/x", enabled: true }]);
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    await webPushProvider.send(payload);

    expect(notificationEndpointUpdate).not.toHaveBeenCalled();
  });

  it("несколько устройств: одно успешно, другое 410 — итог SENT (хотя бы одно доставлено), мёртвое отключено", async () => {
    notificationEndpointFindMany.mockResolvedValue([
      { id: "ep1", endpoint: "https://fcm.googleapis.com/fcm/send/ok", enabled: true },
      { id: "ep2", endpoint: "https://fcm.googleapis.com/fcm/send/dead", enabled: true },
    ]);
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(url.endsWith("/dead") ? { ok: false, status: 410 } : { ok: true, status: 201 })
    );

    const result = await webPushProvider.send(payload);

    expect(result).toEqual({ status: "SENT" });
    expect(notificationEndpointUpdate).toHaveBeenCalledWith({ where: { id: "ep2" }, data: { enabled: false } });
  });
});
