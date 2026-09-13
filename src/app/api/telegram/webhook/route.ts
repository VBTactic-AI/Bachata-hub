import { NextRequest, NextResponse } from "next/server";
import { consumeTelegramLinkToken, TelegramLinkTokenInvalidError } from "@/server/notifications/telegram-link";

// Telegram Bot API webhook — принимает апдейты от Telegram. Единственная
// команда, которую мы реально обрабатываем — "/start <token>" (привязка
// аккаунта, см. telegram-link.ts); остальные апдейты молча игнорируются.
// Подлинность запроса — штатный механизм Telegram (secret_token, передаётся
// при регистрации вебхука через setWebhook и приходит обратно этим
// заголовком на каждый вызов), не изобретаем свою подпись.
async function replyText(chatId: string, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  }).catch(() => {});
}

const START_COMMAND = /^\/start\s+(\S+)/;

export async function POST(req: NextRequest) {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const receivedSecret = req.headers.get("x-telegram-bot-api-secret-token");
  if (!expectedSecret || receivedSecret !== expectedSecret) {
    return NextResponse.json({ error: "forbidden" }, { status: 401 });
  }

  const update = await req.json().catch(() => null);
  const message = update?.message as { chat?: { id?: number }; text?: string } | undefined;
  const chatId = message?.chat?.id != null ? String(message.chat.id) : null;
  const text = typeof message?.text === "string" ? message.text : "";
  const startMatch = text.match(START_COMMAND);

  if (chatId && startMatch) {
    const token = startMatch[1];
    try {
      await consumeTelegramLinkToken(token, chatId);
      await replyText(chatId, "Готово! Уведомления Bachata HUB подключены к этому чату.");
    } catch (err) {
      if (err instanceof TelegramLinkTokenInvalidError) {
        // token_already_used — это повторная доставка ТОГО ЖЕ апдейта
        // (Telegram ретраит недоставленные апдейты) — не ошибка пользователя,
        // ничего заново не шлём. token_not_found/token_expired — реальная
        // проблема (устаревшая/битая ссылка), сообщаем в чат.
        if (err.code !== "token_already_used") {
          await replyText(chatId, "Ссылка для привязки устарела или недействительна — откройте настройки уведомлений на сайте ещё раз.");
        }
      } else {
        throw err;
      }
    }
  }

  // Всегда 200, если апдейт физически разобран — иначе Telegram будет
  // бесконечно ретраить его.
  return NextResponse.json({ ok: true });
}
