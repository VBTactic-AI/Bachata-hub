import type { Metadata } from "next";
import { Unbounded } from "next/font/google";
import { t } from "@/lib/i18n/dictionary";
import { Header } from "@/components/Header";
import "./globals.css";

// Заголовочный шрифт с характером (афиши танцевальных вечеринок) — next/font
// сам скачивает и хостит его при сборке, без обращения к Google с браузера
// пользователя. Основной текст остаётся на системном шрифте — для скорости.
const displayFont = Unbounded({
  subsets: ["latin", "cyrillic"],
  weight: ["600", "800"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: {
    default: `${t.common.siteName} — календарь бачата-событий и школы`,
    template: `%s — ${t.common.siteName}`,
  },
  description: t.meta.homeDescription,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={displayFont.variable}>
      <body>
        <Header />
        <main className="container py-6">
          {children}
        </main>
        <footer className="mt-12 border-t border-line py-7 text-sm text-muted">
          <div className="container">
            <p>{t.footer.about}</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
