import type { Config } from "tailwindcss";

/**
 * Colors are declared as RGB channel triplets in globals.css so that
 * alpha variants (bg-surface/70) work with CSS-variable theming.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        base: "rgb(var(--c-base) / <alpha-value>)",
        surface: "rgb(var(--c-surface) / <alpha-value>)",
        elevated: "rgb(var(--c-elevated) / <alpha-value>)",
        ink: "rgb(var(--c-ink) / <alpha-value>)",
        muted: "rgb(var(--c-muted) / <alpha-value>)",
        brand: "rgb(var(--c-brand) / <alpha-value>)",
        electric: "rgb(var(--c-electric) / <alpha-value>)",
        accent: "rgb(var(--c-accent) / <alpha-value>)",
        magenta: "rgb(var(--c-magenta) / <alpha-value>)",
        gold: "rgb(var(--c-gold) / <alpha-value>)"
      },
      fontFamily: {
        display: ["var(--font-display)", "var(--font-sans)", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"]
      },
      boxShadow: {
        glow: "0 0 40px -8px rgb(var(--c-brand) / 0.5)",
        "glow-accent": "0 0 40px -8px rgb(var(--c-accent) / 0.45)",
        card: "0 24px 60px -24px rgb(0 0 0 / 0.55)"
      },
      maxWidth: {
        "7.5xl": "84rem"
      }
    }
  },
  plugins: []
};

export default config;
