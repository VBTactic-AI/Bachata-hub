import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createTelegramLinkToken, hasTelegramLinked, unlinkTelegram } from "@/server/notifications/telegram-link";

// GET — статус привязки (опрашивается клиентом раз в 2 сек после того, как
// пользователь открыл ссылку Telegram, см. NotificationPreferencesForm.tsx).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const linked = await hasTelegramLinked(user.id);
  return NextResponse.json({ linked });
}

// POST — начать привязку: создать одноразовый токен и вернуть deep link.
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const result = await createTelegramLinkToken(user.id);
  if (!result.configured) {
    return NextResponse.json({ error: "telegram_not_configured" }, { status: 503 });
  }
  return NextResponse.json(result);
}

// DELETE — отвязать Telegram (удаляет NotificationEndpoint пользователя).
export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  await unlinkTelegram(user.id);
  return NextResponse.json({ ok: true });
}
