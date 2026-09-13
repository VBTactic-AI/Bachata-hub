import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

// Telegram provider — привязка аккаунта. Бот не может узнать chatId
// человека по email — только когда человек сам нажмёт Start в Telegram с
// одноразовым токеном в payload (/start <token>). Поток целиком:
// createTelegramLinkToken() (вызывает сайт) → пользователь открывает
// t.me/<bot>?start=<token> → Telegram шлёт апдейт на webhook →
// consumeTelegramLinkToken() создаёт NotificationEndpoint.

const TOKEN_TTL_MS = 10 * 60 * 1000; // 10 минут — одноразовая ссылка привязки, не должна быть годной долго

export type CreateTelegramLinkTokenResult =
  | { configured: true; token: string; botUsername: string; deepLink: string }
  | { configured: false };

export async function createTelegramLinkToken(userId: string): Promise<CreateTelegramLinkTokenResult> {
  const botUsername = process.env.TELEGRAM_BOT_USERNAME;
  if (!botUsername) return { configured: false };

  // Явная генерация через node:crypto, не Prisma @default(cuid()) — токен
  // играет роль секрета одноразовой привязки аккаунта (см. комментарий в
  // schema.prisma), cuid для этого не предназначен.
  const token = crypto.randomBytes(32).toString("hex");

  await prisma.telegramLinkToken.create({
    data: { token, userId, expiresAt: new Date(Date.now() + TOKEN_TTL_MS) },
  });

  return { configured: true, token, botUsername, deepLink: `https://t.me/${botUsername}?start=${token}` };
}

export class TelegramLinkTokenInvalidError extends Error {
  constructor(public code: "token_not_found" | "token_already_used" | "token_expired") {
    super(code);
  }
}

// Вызывается из webhook при получении "/start <token>". Токен помечается
// использованным сразу — повторная доставка того же апдейта Telegram (сеть
// иногда ретраит недоставленные апдейты) во второй раз бросит
// token_already_used, а не создаст вторую привязку; webhook трактует этот
// конкретный код как "уже привязано", не как ошибку пользователю.
export async function consumeTelegramLinkToken(token: string, chatId: string): Promise<{ userId: string }> {
  const row = await prisma.telegramLinkToken.findUnique({ where: { token } });
  if (!row) throw new TelegramLinkTokenInvalidError("token_not_found");
  if (row.consumedAt) throw new TelegramLinkTokenInvalidError("token_already_used");
  if (row.expiresAt < new Date()) throw new TelegramLinkTokenInvalidError("token_expired");

  await prisma.$transaction([
    prisma.telegramLinkToken.update({ where: { token }, data: { consumedAt: new Date() } }),
    prisma.notificationEndpoint.upsert({
      where: { userId_channel_endpoint: { userId: row.userId, channel: "TELEGRAM", endpoint: chatId } },
      create: { userId: row.userId, channel: "TELEGRAM", endpoint: chatId, enabled: true },
      update: { enabled: true },
    }),
  ]);

  return { userId: row.userId };
}

export async function hasTelegramLinked(userId: string): Promise<boolean> {
  const count = await prisma.notificationEndpoint.count({ where: { userId, channel: "TELEGRAM", enabled: true } });
  return count > 0;
}

export async function unlinkTelegram(userId: string): Promise<void> {
  await prisma.notificationEndpoint.deleteMany({ where: { userId, channel: "TELEGRAM" } });
}
