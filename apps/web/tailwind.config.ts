import type { Config } from "tailwindcss";

/**
 * Design tokens for the control-plane UI: dark, minimal, technical — a
 * near-black surface with a single cyan accent, system fonts (no
 * network font fetch, so builds stay reproducible offline/self-hosted).
 */
const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.5s cubic-bezier(0.22, 1, 0.36, 1) both",
      },
      colors: {
        background: "#09090B",
        surface: "#111113",
        "surface-hover": "#18181B",
        border: "#232327",
        foreground: "#F4F4F5",
        muted: "#8B8B93",
        accent: {
          DEFAULT: "#22D3EE",
          foreground: "#052E33",
        },
        success: "#34D399",
        warning: "#FBBF24",
        danger: "#F87171",
      },
      fontFamily: {
        sans: [
          "var(--font-inter)",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: [
          "var(--font-mono-jb)",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
    },
  },
  plugins: [],
};

export default config;
