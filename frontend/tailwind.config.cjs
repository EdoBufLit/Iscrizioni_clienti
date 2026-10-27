/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"] ,
  theme: {
    extend: {
      fontSize: {
        base: ["1rem", { lineHeight: "1.625" }],
      },
      fontFamily: {
        sans: ["var(--font-ui)"],
        display: ["var(--font-ui)"],
      },
      colors: {
        brand: {
          DEFAULT: "rgb(var(--color-brand) / <alpha-value>)",
          light: "rgb(var(--color-brand-light) / <alpha-value>)",
          dark: "rgb(var(--color-brand-dark) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "rgb(var(--color-accent) / <alpha-value>)",
          light: "#eef3f1",
        },
        ember: {
          DEFAULT: "#d2705a",
          dark: "#a5503e",
        },
        warm: {
          50: "#fbfaf7",
          100: "#f4efe7",
        },
        neutral: {
          25: "#f8faf9",
          50: "#f3f6f5",
          100: "#e9eeec",
          200: "#d4dfdc",
          300: "#b0c1bc",
          400: "#7c938b",
          500: "#607471",
          600: "#4b605f",
          700: "#344b47",
          800: "#243b36",
          900: "#182c2b",
        },
      },
      borderRadius: {
        lg: "10px",
        md: "8px",
        sm: "6px",
      },
      boxShadow: {
        subtle: "0 1px 2px rgba(15, 23, 42, 0.06)",
        card: "0 2px 4px rgba(15, 23, 42, 0.04), 0 1px 2px rgba(15, 23, 42, 0.06)",
        elevated:
          "0 4px 12px rgba(15, 23, 42, 0.06), 0 2px 4px rgba(15, 23, 42, 0.04)",
        premium:
          "0 10px 30px rgba(15, 23, 42, 0.08), 0 2px 8px rgba(15, 23, 42, 0.04)",
        "premium-lg":
          "0 20px 50px rgba(15, 23, 42, 0.12), 0 8px 20px rgba(15, 23, 42, 0.06)",
      },
    },
  },
  plugins: [],
};
