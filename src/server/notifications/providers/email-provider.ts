import { prisma } from "@/lib/prisma";
import type { NotificationProvider, DeliveryPayload, ProviderSendResult } from "./types";

// Email-провайдер поверх Resend REST API — обычный fetch(), без SDK-пакета
// (та же причина, что и у Web Push: npm install заблокирован в этой среде
// разработки; сам api.resend.com при этом доступен по сети — проверено).
// Resend выбран как разумный дефолт (простой REST API, не требует SDK,
// щедрый бесплатный тариф) — если у вас уже есть другой ESP, замените
// содержимое send() ниже, интерфейс NotificationProvider не изменится.
const RESEND_API_URL = "https://api.resend.com/emails";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export const emailProvider: NotificationProvider = {
  channel: "EMAIL",

  async send(payload: DeliveryPayload): Promise<ProviderSendResult> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return { status: "FAILED", errorCode: "resend_not_configured", errorMessage: "RESEND_API_KEY не настроен." };
    }

    const user = await prisma.user.findUnique({ where: { id: payload.userId }, select: { email: true } });
    if (!user) return { status: "FAILED", errorMessage: "Пользователь не найден." };

    const fromAddress = process.env.RESEND_FROM_EMAIL || "Bachata HUB <notifications@bachatahub.by>";
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "";
    const link = payload.deepLink ? `${siteUrl}${payload.deepLink}` : null;

    const html = `<p>${escapeHtml(payload.body)}</p>${link ? `<p><a href="${link}">Подробнее</a></p>` : ""}`;

    try {
      const res = await fetch(RESEND_API_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: fromAddress, to: user.email, subject: payload.title, html }),
      });

      if (res.ok) {
        const data = (await res.json().catch(() => ({}))) as { id?: string };
        return { status: "SENT", providerMessageId: data.id };
      }

      const text = await res.text().catch(() => "");
      return { status: "FAILED", errorCode: String(res.status), errorMessage: `Resend ответил ${res.status}: ${text.slice(0, 200)}` };
    } catch (err) {
      return { status: "FAILED", errorMessage: err instanceof Error ? err.message : String(err) };
    }
  },
};
