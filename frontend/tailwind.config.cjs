/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"] ,
  theme: {
    extend: {
      fontSize: {
        base: ["0.9375rem", { lineHeight: "1.625" }],
      },
      fontFamily: {
        sans: ["\"Source Sans 3\"", "system-ui", "sans-serif"],
        display: ["\"Source Serif 4\"", "serif"],
      },
      colors: {
        brand: {
          DEFAULT: "#0f3d3a",
          light: "#1e6f67",
          dark: "#0a2a27",
        },
        accent: {
          DEFAULT: "#c6a04f",
          light: "#f5efe2",
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
          25: "#fdfcf9",
          50: "#f6f3ee",
          100: "#ece6dc",
          200: "#d7cfc1",
          300: "#b9ae9d",
          400: "#9a8f7f",
          500: "#7b7265",
          600: "#5c564c",
          700: "#403c35",
          800: "#2b2722",
          900: "#191612",
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
