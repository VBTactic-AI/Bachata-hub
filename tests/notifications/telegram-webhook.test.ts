import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NextRequest } from "next/server";

const consumeTelegramLinkTokenMock = vi.fn();
class FakeTelegramLinkTokenInvalidError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
vi.mock("@/server/notifications/telegram-link", () => ({
  consumeTelegramLinkToken: (...a: unknown[]) => consumeTelegramLinkTokenMock(...a),
  TelegramLinkTokenInvalidError: FakeTelegramLinkTokenInvalidError,
}));

const { POST } = await import("@/app/api/telegram/webhook/route");

const ORIGINAL_ENV = { ...process.env };
const fetchMock = vi.fn();

function fakeRequest(body: unknown, secretHeader: string | null): NextRequest {
  return {
    headers: { get: (name: string) => (name.toLowerCase() === "x-telegram-bot-api-secret-token" ? secretHeader : null) },
    json: async () => body,
  } as unknown as NextRequest;
}

beforeEach(() => {
  consumeTelegramLinkTokenMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset().mockResolvedValue({ ok: true });
  process.env.TELEGRAM_WEBHOOK_SECRET = "whsecret";
  process.env.TELEGRAM_BOT_TOKEN = "123:tok";
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...ORIGINAL_ENV };
});

describe("POST /api/telegram/webhook — проверка подлинности запроса", () => {
  it("секрет не настроен на сервере — 401, апдейт не разбирается", async () => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET;

    const res = await POST(fakeRequest({ message: { chat: { id: 1 }, text: "/start abc" } }, "whsecret"));

    expect(res.status).toBe(401);
    expect(consumeTelegramLinkTokenMock).not.toHaveBeenCalled();
  });

  it("заголовок секрета не совпадает — 401", async () => {
    const res = await POST(fakeRequest({ message: { chat: { id: 1 }, text: "/start abc" } }, "wrong-secret"));

    expect(res.status).toBe(401);
    expect(consumeTelegramLinkTokenMock).not.toHaveBeenCalled();
  });

  it("заголовок секрета отсутствует вовсе — 401", async () => {
    const res = await POST(fakeRequest({ message: { chat: { id: 1 }, text: "/start abc" } }, null));

    expect(res.status).toBe(401);
  });
});

describe("POST /api/telegram/webhook — разбор /start <token>", () => {
  it("корректный /start <token> — привязывает аккаунт, отвечает подтверждением, возвращает 200", async () => {
    consumeTelegramLinkTokenMock.mockResolvedValue({ userId: "user1" });

    const res = await POST(fakeRequest({ message: { chat: { id: 555111 }, text: "/start abcdef123" } }, "whsecret"));

    expect(res.status).toBe(200);
    expect(consumeTelegramLinkTokenMock).toHaveBeenCalledWith("abcdef123", "555111");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.telegram.org/bot123:tok/sendMessage",
      expect.objectContaining({ method: "POST" })
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.chat_id).toBe("555111");
    expect(body.text).toContain("подключены");
  });

  it("сообщение без /start (обычный текст) — игнорируется, 200, consumeTelegramLinkToken не вызывается", async () => {
    const res = await POST(fakeRequest({ message: { chat: { id: 1 }, text: "привет" } }, "whsecret"));

    expect(res.status).toBe(200);
    expect(consumeTelegramLinkTokenMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("токен просрочен/не найден — отвечает понятным сообщением в чат, но 200 (не ошибка транспорта)", async () => {
    consumeTelegramLinkTokenMock.mockRejectedValue(new FakeTelegramLinkTokenInvalidError("token_expired"));

    const res = await POST(fakeRequest({ message: { chat: { id: 1 }, text: "/start expired" } }, "whsecret"));

    expect(res.status).toBe(200);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.text).toContain("устарела");
  });

  it("токен уже использован (повторная доставка апдейта Telegram) — 200, повторное сообщение НЕ шлётся", async () => {
    consumeTelegramLinkTokenMock.mockRejectedValue(new FakeTelegramLinkTokenInvalidError("token_already_used"));

    const res = await POST(fakeRequest({ message: { chat: { id: 1 }, text: "/start already" } }, "whsecret"));

    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("апдейт без message (например, edited_message) — 200, ничего не разбирается", async () => {
    const res = await POST(fakeRequest({ edited_message: { chat: { id: 1 }, text: "/start x" } }, "whsecret"));

    expect(res.status).toBe(200);
    expect(consumeTelegramLinkTokenMock).not.toHaveBeenCalled();
  });
});
