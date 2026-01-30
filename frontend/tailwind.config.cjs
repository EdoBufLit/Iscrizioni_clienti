/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"] ,
  theme: {
    extend: {
      fontFamily: {
        sans: ["\"IBM Plex Sans\"", "system-ui", "sans-serif"],
      },
      colors: {
        brand: {
          DEFAULT: "#1f4b7a",
          light: "#295c94",
          dark: "#173557",
        },
        neutral: {
          25: "#fcfcfd",
          50: "#f7f8fa",
          100: "#eceff3",
          200: "#d9dfe7",
          300: "#c1c8d4",
          400: "#9aa6b5",
          500: "#6b7785",
          600: "#4b5562",
          700: "#353c45",
          800: "#242a31",
          900: "#15181d",
        },
      },
      borderRadius: {
        lg: "10px",
        md: "8px",
        sm: "6px",
      },
      boxShadow: {
        subtle: "0 1px 2px rgba(15, 23, 42, 0.08)",
      },
    },
  },
  plugins: [],
};
