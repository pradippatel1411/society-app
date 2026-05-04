/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: {
          DEFAULT: "#FAF7F2",
          light: "#FDFCF9",
          dark: "#F0EBE0",
        },
        ink: {
          DEFAULT: "#1A1F2E",
          light: "#3F4555",
          muted: "#6B7280",
        },
        rust: {
          DEFAULT: "#C8693E",
          dark: "#A65431",
          light: "#E48B62",
        },
      },
      fontFamily: {
        serif: ['"Fraunces"', "Georgia", "serif"],
        sans: ['"DM Sans"', "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(26, 31, 46, 0.04), 0 4px 16px rgba(26, 31, 46, 0.06)",
        "card-hover":
          "0 2px 4px rgba(26, 31, 46, 0.06), 0 8px 24px rgba(26, 31, 46, 0.08)",
      },
      animation: {
        "fade-in": "fadeIn 0.4s ease-out",
        "slide-up": "slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
      },
      keyframes: {
        fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
        slideUp: {
          from: { opacity: 0, transform: "translateY(12px)" },
          to: { opacity: 1, transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
}