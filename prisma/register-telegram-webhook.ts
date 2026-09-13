// Telegram provider — одноразовая регистрация вебхука в Telegram Bot API.
// Запускается вручную (`npm run telegram:register-webhook`) ПОСЛЕ того, как
// TELEGRAM_BOT_TOKEN/TELEGRAM_WEBHOOK_SECRET заданы и приложение развёрнуто
// на публичном HTTPS-домене (Telegram не может достучаться до localhost) —
// см. .env.example и src/app/api/telegram/webhook/route.ts. Не требует БД,
// поэтому не через prisma/seed*.ts-паттерн (свой PrismaClient), а просто
// один вызов Bot API.

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

async function main() {
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN не задан в окружении.");
  if (!secret) throw new Error("TELEGRAM_WEBHOOK_SECRET не задан в окружении.");
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
