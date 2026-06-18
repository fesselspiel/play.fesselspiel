import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        redbrand: "rgb(var(--color-brand) / <alpha-value>)",
        redbrandHover: "rgb(var(--color-brand-hover) / <alpha-value>)",
        canvas: "rgb(var(--color-canvas) / <alpha-value>)",
        surface: "rgb(var(--color-surface) / <alpha-value>)",
        paper: "rgb(var(--color-paper) / <alpha-value>)",
        line: "rgb(var(--color-line) / <alpha-value>)",
        graphite: "rgb(var(--color-graphite) / <alpha-value>)",
        ink: "rgb(var(--color-ink) / <alpha-value>)"
      },
      boxShadow: {
        soft: "0 12px 30px rgba(17, 17, 17, 0.06)"
      }
    }
  },
  plugins: []
};

export default config;
