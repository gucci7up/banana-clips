/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        banana: {
          primary: '#FFD43B',
          secondary: '#FFB703',
          bg: '#111318',
          surface: '#1B1E25',
          text: '#F8FAFC',
          muted: '#94A3B8',
        },
      },
    },
  },
  plugins: [],
};
