import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f4f6ff',
          100: '#e6eaff',
          200: '#c3ccff',
          500: '#4f5fe0',
          600: '#3f4dc4',
          700: '#333fa0',
        },
      },
    },
  },
  plugins: [],
};

export default config;
