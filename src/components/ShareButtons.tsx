"use client";

import { t } from "@/lib/i18n/dictionary";

// Заточено под то, как реально расшаривают контент в этой аудитории —
// Telegram и Instagram, а не абстрактная кнопка Web Share API.
export function ShareButtons({ url, title }: { url: string; title: string }) {
  const telegramHref = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`;

  async function copyForInstagram() {
    try {
      await navigator.clipboard.writeText(`${title}\n${url}`);
      alert(t.event.copiedForInstagram);
    } catch {
      // буфер обмена недоступен — молча игнорируем, ссылка всё равно на странице
    }
  }

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <a className="btn btn-secondary btn-sm" href={telegramHref} target="_blank" rel="noopener noreferrer">
        {t.event.shareTelegram}
      </a>
      <button className="btn btn-secondary btn-sm" type="button" onClick={copyForInstagram}>
        {t.event.shareInstagram}
      </button>
    </div>
  );
}
