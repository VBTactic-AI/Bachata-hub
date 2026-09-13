// Telegram provider — одноразовая регистрация вебхука в Telegram Bot API.
// Запускается вручную (`npm run telegram:register-webhook`) ПОСЛЕ того, как
// TELEGRAM_BOT_TOKEN/TELEGRAM_WEBHOOK_SECRET заданы и приложение развёрнуто
// на публичном HTTPS-домене (Telegram не может достучаться до localhost) —
// см. .env.example и src/app/api/telegram/webhook/route.ts. Не требует БД,
// поэтому не через prisma/seed*.ts-паттерн (свой PrismaClient), а просто
// один вызов Bot API.
//
// ВАЖНО: `tsx` НЕ подхватывает .env сам по себе (в отличие от seed*.ts —
// там .env грузит побочным эффектом сам PrismaClient при импорте, здесь
// PrismaClient не участвует вообще). Значения нужно передать явно в
// переменные окружения самой команды запуска, например (PowerShell,
// с реальным прод-доменом, а не тем, что в локальном .env):
//   $env:TELEGRAM_BOT_TOKEN="..."; $env:TELEGRAM_BOT_USERNAME="...";
//   $env:TELEGRAM_WEBHOOK_SECRET="..."; $env:NEXT_PUBLIC_SITE_URL="https://ваш-домен";
//   npx tsx prisma/register-telegram-webhook.ts
// Найдено вживую 2026-09-13: обычный `openssl rand -base64 32`/
// RandomNumberGenerator+ToBase64String для TELEGRAM_WEBHOOK_SECRET Telegram
// ОТКЛОНЯЕТ ("secret token contains illegal characters") — Bot API требует
// строго `^[A-Za-z0-9_-]{1,256}$`, base64 даёт недопустимые `+`/`/`/`=`.
// Используйте hex или base64url без padding, не обычный base64.

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

async function main() {
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN не задан в окружении.");
  if (!secret) throw new Error("TELEGRAM_WEBHOOK_SECRET не задан в окружении.");
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(secret)) {
    throw new Error(
      "TELEGRAM_WEBHOOK_SECRET содержит символы, которые Telegram отклонит (нужны только A-Za-z0-9_-) — сгенерируйте заново в hex/base64url, не обычным base64."
    );
  }
  if (!siteUrl || siteUrl.includes("localhost")) {
    throw new Error(
      "NEXT_PUBLIC_SITE_URL должен указывать на публичный HTTPS-домен (не localhost) — Telegram обязан достучаться до него сам."
    );
  }

  const webhookUrl = `${siteUrl}/api/telegram/webhook`;
  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: webhookUrl, secret_token: secret }),
  });

  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(`Telegram отклонил setWebhook: ${JSON.stringify(data)}`);
  }

  console.log(`Вебхук зарегистрирован: ${webhookUrl}`);
  console.log(data.description ?? "OK");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
