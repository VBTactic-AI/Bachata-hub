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
        // "night" — отдельная тёмная палитра ТОЛЬКО для нового публичного
        // раздела /compete (список конкурсов → карточка → регистрация),
        // по образцу референса пользователя. Остальной сайт (включая
        // /admin) продолжает жить на светлых токенах выше — это осознанно
        // два визуальных языка в одном проекте, не ошибка (подтверждено
        // пользователем, 2026-09-04): добавлено новым namespace в тот же
        // конфиг, а не отдельным CSS-in-JS/дублирующей системой.
        night: {
          bg: "#0B0D16",
          card: "#151725",
          card2: "#1A1C2B",
          border: "rgba(255,255,255,0.08)",
          primary: "#7C3AED",
          pink: "#EC4899",
          success: "#22C55E",
          text: "#FFFFFF",
          muted: "#9CA3AF",
          disabled: "#555866",
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
        "gradient-night-cta": "linear-gradient(90deg, #6D3DF5, #F05AA6)",
        "gradient-night-hero": "linear-gradient(135deg, #4C1D95 0%, #7C3AED 45%, #EC4899 100%)",
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
