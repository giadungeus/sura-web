// Tailwind CSS 4 qua PostCSS: chạy được với cả Turbopack (máy tính) và webpack
// (`npm run build:webpack`, dùng trên hosting không chạy được Turbopack).
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
