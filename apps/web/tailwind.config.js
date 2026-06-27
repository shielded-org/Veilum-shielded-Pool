/** @type {import('tailwindcss').Config} */
export default {
  important: [".landing-page", ".dashboard-shell"],
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        veilum: {
          bg: "var(--veilum-bg)",
          elevated: "var(--veilum-elevated)",
          terminal: "var(--veilum-terminal)",
          text: "var(--veilum-text)",
          accent: "var(--veilum-accent)",
          "accent-soft": "var(--veilum-accent-soft)",
          border: "var(--veilum-border)",
          muted: "var(--veilum-muted)",
          subtle: "var(--veilum-subtle)",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      boxShadow: {
        "veilum-nav": "0 12px 32px var(--nav-shadow)",
        "veilum-hero": "0 24px 48px var(--hero-shadow)",
      },
      animation: {
        scroll: "scroll var(--animation-duration, 40s) var(--animation-direction, forwards) linear infinite",
        spotlight: "spotlight 2s ease .75s 1 forwards",
        shimmer: "shimmer 2s linear infinite",
      },
      keyframes: {
        scroll: {
          to: { transform: "translate(calc(-50% - 0.5rem))" },
        },
        spotlight: {
          "0%": { opacity: 0, transform: "translate(-72%, -62%) scale(0.5)" },
          "100%": { opacity: 1, transform: "translate(-50%, -40%) scale(1)" },
        },
        shimmer: {
          from: { backgroundPosition: "0 0" },
          to: { backgroundPosition: "-200% 0" },
        },
      },
      backgroundImage: {
        "grid-white":
          "linear-gradient(to right, var(--grid-line) 1px, transparent 1px), linear-gradient(to bottom, var(--grid-line) 1px, transparent 1px)",
      },
    },
  },
  plugins: [],
};
