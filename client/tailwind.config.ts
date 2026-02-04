import type { Config } from "tailwindcss";

export default {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#0a1628',
        card: '#ffffff',
        border: '#e5e7eb',
        textPrimary: '#1a1a1a',
        textSecondary: '#6b7280',
        textTertiary: '#9ca3af',
        cyber: {
          blue: '#00d4ff',
          glow: 'rgba(0, 212, 255, 0.3)',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
