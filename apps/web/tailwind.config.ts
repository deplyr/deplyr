import type { Config } from "tailwindcss";

/**
 * Design tokens for the control-plane UI — real light + dark, both first
 * class (see app/globals.css for the actual HSL values; this file just
 * wires Tailwind's color names to them so `bg-background`, `text-accent`,
 * `bg-accent/10` etc. all resolve to whichever theme is active). Fonts are
 * self-hosted-at-build (next/font downloads once during `next build`, ships
 * from the same origin after — no runtime calls out, so a deployed
 * instance works fully offline).
 */
function hsl(variable: string) {
  return `hsl(var(${variable}) / <alpha-value>)`;
}

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      borderRadius: {
        DEFAULT: "0.625rem",
      },
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
        background: hsl("--background"),
        surface: hsl("--surface"),
        "surface-hover": hsl("--surface-hover"),
        border: hsl("--border"),
        foreground: hsl("--foreground"),
        muted: hsl("--muted"),
        accent: {
          DEFAULT: hsl("--accent"),
          foreground: hsl("--accent-foreground"),
        },
        success: hsl("--success"),
        warning: hsl("--warning"),
        danger: hsl("--danger"),
        sidebar: {
          DEFAULT: hsl("--sidebar-background"),
          border: hsl("--sidebar-border"),
          accent: hsl("--sidebar-accent"),
        },
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
