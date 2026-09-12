import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // 제작 화면(에디터)용 기존 브랜드 — 유지
        brand: {
          50: '#f4f6ff',
          100: '#e6eaff',
          200: '#c3ccff',
          500: '#4f5fe0',
          600: '#3f4dc4',
          700: '#333fa0',
        },
        // 도감 톤: 종이 · 먹 · 노을
        paper: {
          50: '#fdfbf7',
          100: '#f7f2e8',
          200: '#ece3d2',
          300: '#dcceb4',
        },
        ink: {
          400: '#8a8175',
          600: '#4c4639',
          800: '#2b271f',
        },
        sunset: {
          400: '#f0a35e',
          500: '#e3823a',
          600: '#c4652a',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        serif: ['var(--font-serif)', 'Georgia', 'serif'],
        display: ['var(--font-display)', 'var(--font-serif)', 'serif'],
      },
    },
  },
  plugins: [],
};

export default config;
