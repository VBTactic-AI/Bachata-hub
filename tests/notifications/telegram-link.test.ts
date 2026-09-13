import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const telegramLinkTokenCreate = vi.fn();
const telegramLinkTokenFindUnique = vi.fn();
const telegramLinkTokenUpdate = vi.fn();
const notificationEndpointUpsert = vi.fn();
const notificationEndpointCount = vi.fn();
const notificationEndpointDeleteMany = vi.fn();
const transactionMock = vi.fn((ops: unknown[]) => Promise.all(ops));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    telegramLinkToken: {
      create: (...a: unknown[]) => telegramLinkTokenCreate(...a),
      findUnique: (...a: unknown[]) => telegramLinkTokenFindUnique(...a),
      update: (...a: unknown[]) => telegramLinkTokenUpdate(...a),
    },
    notificationEndpoint: {
      upsert: (...a: unknown[]) => notificationEndpointUpsert(...a),
      count: (...a: unknown[]) => notificationEndpointCount(...a),
      deleteMany: (...a: unknown[]) => notificationEndpointDeleteMany(...a),
    },
    $transaction: (...a: unknown[]) => transactionMock(...(a as [unknown[]])),
  },
}));

const { createTelegramLinkToken, consumeTelegramLinkToken, hasTelegramLinked, unlinkTelegram, TelegramLinkTokenInvalidError } =
  await import("@/server/notifications/telegram-link");

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  telegramLinkTokenCreate.mockReset().mockResolvedValue({});
  telegramLinkTokenFindUnique.mockReset();
  telegramLinkTokenUpdate.mockReset().mockResolvedValue({});
  notificationEndpointUpsert.mockReset().mockResolvedValue({});
  notificationEndpointCount.mockReset();
  notificationEndpointDeleteMany.mockReset().mockResolvedValue({ count: 0 });
  transactionMock.mockClear();
});
afterEach(() => {
  process.env = ORIGINAL_ENV;
});

describe("createTelegramLinkToken()", () => {
  it("TELEGRAM_BOT_USERNAME не настроен — configured:false, токен не создаётся", async () => {
    delete process.env.TELEGRAM_BOT_USERNAME;

    const result = await createTelegramLinkToken("user1");

    expect(result).toEqual({ configured: false });
    expect(telegramLinkTokenCreate).not.toHaveBeenCalled();
  });

  it("настроен — создаёт токен и возвращает рабочую deep link", async () => {
    process.env.TELEGRAM_BOT_USERNAME = "BachataHubBot";

    const result = await createTelegramLinkToken("user1");

    expect(result.configured).toBe(true);
    if (!result.configured) throw new Error("unreachable");
    expect(result.botUsername).toBe("BachataHubBot");
    expect(result.deepLink).toBe(`https://t.me/BachataHubBot?start=${result.token}`);
    expect(result.token).toMatch(/^[0-9a-f]{64}$/); // 32 байта в hex
    expect(telegramLinkTokenCreate).toHaveBeenCalledWith({
      data: { token: result.token, userId: "user1", expiresAt: expect.any(Date) },
    });
  });

  it("каждый вызов генерирует новый уникальный токен", async () => {
    process.env.TELEGRAM_BOT_USERNAME = "BachataHubBot";

    const a = await createTelegramLinkToken("user1");
    const b = await createTelegramLinkToken("user1");

    if (!a.configured || !b.configured) throw new Error("unreachable");
    expect(a.token).not.toBe(b.token);
  });
});

describe("consumeTelegramLinkToken()", () => {
  it("токен не найден — TelegramLinkTokenInvalidError('token_not_found'), транзакция не запускается", async () => {
    telegramLinkTokenFindUnique.mockResolvedValue(null);

    await expect(consumeTelegramLinkToken("ghost", "chat1")).rejects.toThrow(TelegramLinkTokenInvalidError);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("токен уже использован — token_already_used, повторно endpoint не трогает", async () => {
    telegramLinkTokenFindUnique.mockResolvedValue({
      token: "t1",
      userId: "user1",
      consumedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    const err = await consumeTelegramLinkToken("t1", "chat1").catch((e) => e);
    expect(err).toBeInstanceOf(TelegramLinkTokenInvalidError);
    expect(err.code).toBe("token_already_used");
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("токен просрочен — token_expired", async () => {
    telegramLinkTokenFindUnique.mockResolvedValue({
      token: "t1",
      userId: "user1",
      consumedAt: null,
      expiresAt: new Date(Date.now() - 1000),
    });

    const err = await consumeTelegramLinkToken("t1", "chat1").catch((e) => e);
    expect(err).toBeInstanceOf(TelegramLinkTokenInvalidError);
    expect(err.code).toBe("token_expired");
  });

  it("валидный токен — помечает использованным и создаёт/обновляет NotificationEndpoint одной транзакцией", async () => {
    telegramLinkTokenFindUnique.mockResolvedValue({
      token: "t1",
      userId: "user1",
      consumedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const result = await consumeTelegramLinkToken("t1", "chat123");

    expect(result).toEqual({ userId: "user1" });
    expect(telegramLinkTokenUpdate).toHaveBeenCalledWith({ where: { token: "t1" }, data: { consumedAt: expect.any(Date) } });
    expect(notificationEndpointUpsert).toHaveBeenCalledWith({
      where: { userId_channel_endpoint: { userId: "user1", channel: "TELEGRAM", endpoint: "chat123" } },
      create: { userId: "user1", channel: "TELEGRAM", endpoint: "chat123", enabled: true },
      update: { enabled: true },
    });
    expect(transactionMock).toHaveBeenCalledTimes(1);
  });
});

describe("hasTelegramLinked()/unlinkTelegram()", () => {
  it("hasTelegramLinked — true, если есть хотя бы один активный endpoint", async () => {
    notificationEndpointCount.mockResolvedValue(1);
    expect(await hasTelegramLinked("user1")).toBe(true);
    expect(notificationEndpointCount).toHaveBeenCalledWith({ where: { userId: "user1", channel: "TELEGRAM", enabled: true } });
  });

  it("hasTelegramLinked — false, если ни одного", async () => {
    notificationEndpointCount.mockResolvedValue(0);
    expect(await hasTelegramLinked("user1")).toBe(false);
  });

  it("unlinkTelegram — удаляет все TELEGRAM-эндпоинты пользователя", async () => {
    await unlinkTelegram("user1");
    expect(notificationEndpointDeleteMany).toHaveBeenCalledWith({ where: { userId: "user1", channel: "TELEGRAM" } });
  });
});
