import type { Metadata } from "next";
import { t } from "@/lib/i18n/dictionary";
import { Header } from "@/components/Header";
import "./globals.css";

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
    <html lang="ru">
      <body>
        <Header />
        <main className="container" style={{ paddingTop: 24, paddingBottom: 24 }}>
          {children}
        </main>
        <footer className="site-footer">
          <div className="container">
            <p>{t.footer.about}</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
