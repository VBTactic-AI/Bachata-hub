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
          text: "#ffffff",
          muted: "#8d7c85",
          disabled: "#5f5158",
          // Отдельный фиолетовый акцент только для "Этапов отбора" (по
          // референсу пользователя, 07.09.2026) — визуально отличает
          // временную шкалу этапов от основной маджента-палитры сайта.
          violet: "#7c3aed",
          "violet-dark": "#4c1d95",
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
        "gradient-night-violet": "linear-gradient(100deg, #7c3aed, #4c1d95)",
        "gradient-night-hero":
          "radial-gradient(120% 90% at 25% 10%, rgba(255,45,138,0.4) 0%, transparent 58%), radial-gradient(100% 80% at 85% 95%, rgba(108,43,255,0.35) 0%, transparent 62%), linear-gradient(165deg, #331629, #120a12)",
      },
      transitionTimingFunction: {
        brand: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      keyframes: {
        "card-in": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "none" },
        },
      },
      animation: {
        "card-in": "card-in 420ms cubic-bezier(0.16, 1, 0.3, 1) both",
      },
    },
  },
  plugins: [],
} satisfies Config;
