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

const sendNotificationMock = vi.fn();
class FakeWebPushError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}
vi.mock("web-push", () => ({
  sendNotification: (...a: unknown[]) => sendNotificationMock(...a),
  WebPushError: FakeWebPushError,
}));

const { webPushProvider } = await import("@/server/notifications/providers/web-push-provider");

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  notificationEndpointFindMany.mockReset();
  notificationEndpointUpdate.mockReset().mockResolvedValue({});
  sendNotificationMock.mockReset();
  process.env.VAPID_PUBLIC_KEY = "BFbDb50uuiFoSBj69UzV4YdtfW7GHdRA_Zlu0SzJUO7LqCQ_5RzJEAK3S1f1wT6k1w2e73n95m7lTyloni3lEe8";
  process.env.VAPID_PRIVATE_KEY = "rYMtYhTXB2JOGWkbRCh8TkUvb0Sj01GAL29UF5BBt6U";
  process.env.VAPID_SUBJECT = "mailto:admin@bachatahub.by";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

const payload = { userId: "u1", title: "Новое событие", body: "Bachata Night — 20 сентября", deepLink: "/events/party" };
const endpointRow = { id: "ep1", endpoint: "https://fcm.googleapis.com/fcm/send/abc", metadata: { p256dh: "p256dh-key", auth: "auth-key" } };

describe("webPushProvider — через пакет web-push (реальное шифрование payload)", () => {
  it("VAPID-ключи не настроены — FAILED, sendNotification не вызывается, БД не запрашивается", async () => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;

    const result = await webPushProvider.send(payload);

    expect(result).toEqual({ status: "FAILED", errorCode: "vapid_not_configured", errorMessage: "VAPID-ключи не настроены (VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY)." });
    expect(notificationEndpointFindMany).not.toHaveBeenCalled();
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it("нет активных endpoint'ов у пользователя — FAILED('no_endpoint')", async () => {
    notificationEndpointFindMany.mockResolvedValue([]);

    const result = await webPushProvider.send(payload);

    expect(result).toEqual({ status: "FAILED", errorCode: "no_endpoint", errorMessage: "Нет активной подписки Web Push у этого пользователя." });
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it("успех — sendNotification вызван с subscription/keys, зашифрованным (через пакет) payload title/body/deepLink и vapidDetails", async () => {
    notificationEndpointFindMany.mockResolvedValue([endpointRow]);
    sendNotificationMock.mockResolvedValue({ statusCode: 201, body: "", headers: {} });

    const result = await webPushProvider.send(payload);

    expect(result).toEqual({ status: "SENT" });
    expect(sendNotificationMock).toHaveBeenCalledWith(
      { endpoint: endpointRow.endpoint, keys: { p256dh: "p256dh-key", auth: "auth-key" } },
      JSON.stringify({ title: payload.title, body: payload.body, deepLink: payload.deepLink }),
      {
        vapidDetails: { subject: "mailto:admin@bachatahub.by", publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY },
        TTL: 86400,
      }
    );
  });

  it("endpoint без ключей p256dh/auth (испорченные данные) — FAILED, sendNotification не вызывается", async () => {
    notificationEndpointFindMany.mockResolvedValue([{ id: "ep1", endpoint: "https://fcm.googleapis.com/fcm/send/abc", metadata: {} }]);

    const result = await webPushProvider.send(payload);

    expect(result.status).toBe("FAILED");
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it("push-сервис вернул 410 Gone (WebPushError) — endpoint отключается (enabled: false)", async () => {
    notificationEndpointFindMany.mockResolvedValue([endpointRow]);
    sendNotificationMock.mockRejectedValue(new FakeWebPushError("Received unexpected response code", 410));

    const result = await webPushProvider.send(payload);

    expect(result.status).toBe("FAILED");
    expect(notificationEndpointUpdate).toHaveBeenCalledWith({ where: { id: "ep1" }, data: { enabled: false } });
  });

  it("push-сервис вернул 500 (временный сбой) — endpoint НЕ отключается", async () => {
    notificationEndpointFindMany.mockResolvedValue([endpointRow]);
    sendNotificationMock.mockRejectedValue(new FakeWebPushError("Received unexpected response code", 500));

    await webPushProvider.send(payload);

    expect(notificationEndpointUpdate).not.toHaveBeenCalled();
  });

  it("несколько устройств: одно успешно, другое 410 — итог SENT, мёртвое отключено", async () => {
    const deadEndpoint = { id: "ep2", endpoint: "https://fcm.googleapis.com/fcm/send/dead", metadata: { p256dh: "x", auth: "y" } };
    notificationEndpointFindMany.mockResolvedValue([endpointRow, deadEndpoint]);
    sendNotificationMock.mockImplementation((sub: { endpoint: string }) =>
      sub.endpoint.endsWith("/dead")
        ? Promise.reject(new FakeWebPushError("gone", 410))
        : Promise.resolve({ statusCode: 201, body: "", headers: {} })
    );

    const result = await webPushProvider.send(payload);

    expect(result).toEqual({ status: "SENT" });
    expect(notificationEndpointUpdate).toHaveBeenCalledWith({ where: { id: "ep2" }, data: { enabled: false } });
  });

  it("сетевая ошибка (не WebPushError) — FAILED с текстом исключения, не падает наружу", async () => {
    notificationEndpointFindMany.mockResolvedValue([endpointRow]);
    sendNotificationMock.mockRejectedValue(new Error("ECONNRESET"));

    const result = await webPushProvider.send(payload);

    expect(result).toEqual({ status: "FAILED", errorMessage: expect.stringContaining("ECONNRESET") });
  });
});
