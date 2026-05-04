/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#090D14',
        surface: '#121A28',
        cyanNeon: '#00FFFF',
        textPrimary: '#E0E6ED',
        textSecondary: '#8B9EB7',
      }
    },
  },
  plugins: [],
}