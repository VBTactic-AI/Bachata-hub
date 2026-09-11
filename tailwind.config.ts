import type { Config } from "tailwindcss";

// Палитра и радиусы 1:1 повторяют прежний ручной globals.css — задача этого
// перехода на Tailwind в том, чтобы визуально ничего не изменилось, а
// технология оформления стала единой для старых и новых (конкурсных)
// страниц сайта.
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#f7f7f9",
        surface: "#ffffff",
        ink: "#17151c",
        muted: "#6b6475",
        line: "#e7e5ea",
        primary: {
          DEFAULT: "#a8296b",
          dark: "#7c1d4f",
          light: "#fdf1f6",
          soft: "#f6d9e6",
        },
        accent: {
          DEFAULT: "#f2994a",
          light: "#fdf0e0",
        },
        success: {
          DEFAULT: "#2e7d5b",
          light: "#e6f4ec",
        },
        danger: {
          DEFAULT: "#c0392b",
          light: "#fbeae7",
        },
        // "night" — тёмная палитра всего сайта поверх макета Claude Design
        // "JBJ Platform" (06-07.09.2026). Единая маджента как основной акцент;
        // /moderation и /admin/competitions/[id] пока остаются светлыми
        // (последний перенос не завершён намеренно — см. коммиты 06-07.09).
        night: {
          bg: "#080508",
          card: "#150d12",
          card2: "#1d1219",
          border: "#2a1a22",
          primary: "#ff2d8a",
          accent: "#ff2d8a",
          pink: "#ff9ac9",
          success: "#37d67a",
          // Общие semantic-статусы, которых раньше не было токеном (места
          // использования брали обычный Tailwind red-400/amber-400 мимо
          // темы) — добавлены аддитивно, ничего существующего не переименовано.
          warning: "#f59e0b",
          danger: "#f87171",
          text: "#ffffff",
          muted: "#8d7c85",
          disabled: "#5f5158",
        },
        // Палитра для /admin (redesign по dark-SaaS reference, 2026-09-08 —
        // изначально только акцент; 2026-09-09 — референс "Этапы отбора"
        // явно потребовал navy-базу вместо тёплого маджента-оттенка
        // night-bg/card/border, "минимум фиолетового"). Остальной тёмный
        // сайт (/compete, /login и т.д.) остаётся на night-* (маджента).
        //
        // Экран судьи (/judging/**) — ИСКЛЮЧЕНИЕ из этого разделения:
        // до 2026-09-10 сознательно оставался на night-*, но пользователь
        // явно попросил перекрасить его в admin-* ("как в Админ панели, в
        // таких же оттенках"), отменив прежнее решение. JudgeScoreButtons.tsx
        // и judging/FinalJudgingScreen.tsx (физически лежат в
        // src/components/admin/, но обслуживают судью, не организатора)
        // теперь тоже используют admin-*, а не night-*.

        admin: {
          primary: "#3b82f6",
          primaryHover: "#60a5fa",
          violet: "#8b5cf6",
          bg: "#05070d",
          card: "#0d1220",
          card2: "#131a2c",
          border: "#1f2a44",
          muted: "#8b95b3",
          disabled: "#4b5573",
        },
      },
      fontFamily: {
        body: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Arial",
          "sans-serif",
        ],
        display: [
          "var(--font-display)",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Arial",
          "sans-serif",
        ],
        // Montserrat — шрифт тёмного "night"-раздела (макет JBJ Platform),
        // отдельно от --font-display (Unbounded), который остаётся
        // заголовочным шрифтом светлого сайта.
        night: ["var(--font-night)", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "Arial", "sans-serif"],
      },
      borderRadius: {
        app: "16px",
        "app-sm": "10px",
      },
      boxShadow: {
        sm: "0 1px 2px rgba(23, 21, 28, 0.05), 0 1px 1px rgba(23, 21, 28, 0.04)",
        md: "0 10px 24px rgba(23, 21, 28, 0.08), 0 2px 6px rgba(23, 21, 28, 0.05)",
      },
      backgroundImage: {
        "gradient-primary": "linear-gradient(135deg, #a8296b 0%, #c9376f 100%)",
        "gradient-school": "linear-gradient(135deg, #f6d9e6, #fdf0e0)",
        "gradient-night-cta": "linear-gradient(100deg, #ff2d8a, #d6006c)",
        "gradient-admin-cta": "linear-gradient(100deg, #3b82f6, #2563eb)",
        "gradient-night-hero":
          "radial-gradient(120% 90% at 25% 10%, rgba(255,45,138,0.4) 0%, transparent 58%), radial-gradient(100% 80% at 85% 95%, rgba(108,43,255,0.35) 0%, transparent 62%), linear-gradient(165deg, #331629, #120a12)",
        // Диагональный блик для "Card Light Sweep" (стеклянные карточки
        // событий/школ на главной, 2026-09-11) — двигается через
        // background-position, не через отдельный skew-элемент.
        "card-sweep":
          "linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.14) 45%, rgba(255,255,255,0.3) 50%, rgba(255,255,255,0.14) 55%, transparent 70%)",
      },
      transitionTimingFunction: {
        brand: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      keyframes: {
        "card-in": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "none" },
        },
        // Тап по сердечку на странице голосования (Приз зрительских
        // симпатий) — CSS-анимация без внешней библиотеки (CLAUDE.md §14).
        "heart-pop": {
          "0%": { transform: "scale(1)" },
          "35%": { transform: "scale(1.35)" },
          "60%": { transform: "scale(0.92)" },
          "100%": { transform: "scale(1)" },
        },
        // Блик "паркуется" за левым краем карточки первые 60% цикла (не
        // виден, background-position за пределами background-size), затем
        // за оставшиеся ~40% пробегает по диагонали до правого края — редкий
        // ambient-повтор, а не постоянное мельтешение. Работает одинаково на
        // hover (desktop) и без него (мобильный — там наведения нет, CLAUDE.md
        // §40 mobile-first), задержка перед стартом рандомизируется по
        // карточке через animation-delay (см. использование в page.tsx).
        "card-sweep": {
          "0%, 60%": { backgroundPosition: "-60% 0%" },
          "100%": { backgroundPosition: "160% 0%" },
        },
      },
      animation: {
        "card-in": "card-in 420ms cubic-bezier(0.16, 1, 0.3, 1) both",
        "heart-pop": "heart-pop 380ms cubic-bezier(0.16, 1, 0.3, 1) both",
        "card-sweep": "card-sweep 4200ms ease-in-out infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
