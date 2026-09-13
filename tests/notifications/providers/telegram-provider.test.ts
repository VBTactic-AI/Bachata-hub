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

const { telegramProvider } = await import("@/server/notifications/providers/telegram-provider");

const ORIGINAL_ENV = { ...process.env };
const fetchMock = vi.fn();

beforeEach(() => {
  notificationEndpointFindMany.mockReset();
  notificationEndpointUpdate.mockReset().mockResolvedValue({});
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  process.env.TELEGRAM_BOT_TOKEN = "123456:test-token";
  process.env.NEXT_PUBLIC_SITE_URL = "https://bachatahub.by";
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...ORIGINAL_ENV };
});

const payload = { userId: "u1", title: "Новое событие", body: "Bachata Night — 20 сентября", deepLink: "/events/party" };
const endpointRow = { id: "ep1", endpoint: "555111222" };

describe("telegramProvider — Bot API через fetch, без SDK-пакета", () => {
  it("TELEGRAM_BOT_TOKEN не задан — FAILED, fetch и БД не трогаются", async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;

    const result = await telegramProvider.send(payload);

    expect(result).toEqual({ status: "FAILED", errorCode: "telegram_not_configured", errorMessage: "TELEGRAM_BOT_TOKEN не настроен." });
    expect(notificationEndpointFindMany).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("нет привязанного чата у пользователя — FAILED('no_endpoint'), fetch не вызывается", async () => {
    notificationEndpointFindMany.mockResolvedValue([]);

    const result = await telegramProvider.send(payload);

    expect(result).toEqual({ status: "FAILED", errorCode: "no_endpoint", errorMessage: "Telegram не привязан у этого пользователя." });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("успех — POST на api.telegram.org/bot<token>/sendMessage с текстом и inline-кнопкой на deepLink", async () => {
    notificationEndpointFindMany.mockResolvedValue([endpointRow]);
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });

    const result = await telegramProvider.send(payload);

    expect(result).toEqual({ status: "SENT" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.telegram.org/bot123456:test-token/sendMessage",
      expect.objectContaining({ method: "POST" })
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.chat_id).toBe("555111222");
    expect(body.text).toContain("Новое событие");
    expect(body.text).toContain("Bachata Night — 20 сентября");
    expect(body.reply_markup.inline_keyboard[0][0]).toEqual({ text: "Открыть", url: "https://bachatahub.by/events/party" });
  });

  it("нет deepLink — сообщение без inline-кнопки, без ошибки", async () => {
    notificationEndpointFindMany.mockResolvedValue([endpointRow]);
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });

    await telegramProvider.send({ ...payload, deepLink: null });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.reply_markup).toBeUndefined();
  });

  it("Telegram вернул 403 (бот заблокирован) — endpoint отключается (enabled: false)", async () => {
    notificationEndpointFindMany.mockResolvedValue([endpointRow]);
    fetchMock.mockResolvedValue({ ok: false, status: 403, json: async () => ({ description: "Forbidden: bot was blocked by the user" }) });

    const result = await telegramProvider.send(payload);

    expect(result.status).toBe("FAILED");
    expect(notificationEndpointUpdate).toHaveBeenCalledWith({ where: { id: "ep1" }, data: { enabled: false } });
  });

  it("Telegram вернул 500 (временный сбой) — endpoint НЕ отключается", async () => {
    notificationEndpointFindMany.mockResolvedValue([endpointRow]);
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({ description: "Internal error" }) });

    await telegramProvider.send(payload);

    expect(notificationEndpointUpdate).not.toHaveBeenCalled();
  });

  it("несколько чатов: один успешно, другой 403 — итог SENT, мёртвый отключён", async () => {
    const deadEndpoint = { id: "ep2", endpoint: "999888777" };
    notificationEndpointFindMany.mockResolvedValue([endpointRow, deadEndpoint]);
    fetchMock.mockImplementation((_url: string, init: { body: string }) => {
      const body = JSON.parse(init.body);
      return body.chat_id === "999888777"
        ? Promise.resolve({ ok: false, status: 403, json: async () => ({ description: "blocked" }) })
        : Promise.resolve({ ok: true, json: async () => ({ ok: true }) });
    });

    const result = await telegramProvider.send(payload);

    expect(result).toEqual({ status: "SENT" });
    expect(notificationEndpointUpdate).toHaveBeenCalledWith({ where: { id: "ep2" }, data: { enabled: false } });
  });

  it("сетевая ошибка (fetch бросил исключение) — FAILED, не падает наружу", async () => {
    notificationEndpointFindMany.mockResolvedValue([endpointRow]);
    fetchMock.mockRejectedValue(new Error("ECONNRESET"));

    const result = await telegramProvider.send(payload);

    expect(result).toEqual({ status: "FAILED", errorMessage: expect.stringContaining("ECONNRESET") });
  });
});
