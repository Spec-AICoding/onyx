/** @type {import('tailwindcss').Config} */
const plugin = require("tailwindcss/plugin");

module.exports = {
  presets: [require("@onyx-ai/opal/tailwind-preset")],
  darkMode: "class",
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    container: { center: true },
    extend: {
      // 中文字体优先：覆盖 opal preset 的 Hanken Grotesk 字体栈
      fontFamily: {
        sans: [
          "PingFang SC",
          "Noto Sans SC",
          "Hanken Grotesk",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        hanken: [
          "PingFang SC",
          "Noto Sans SC",
          "Hanken Grotesk",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
      lineClamp: { 7: "7", 8: "8", 9: "9", 10: "10" },
      screens: {
        sm: "724px",
        md: "912px",
        lg: "1232px",
        "2xl": "1420px",
        "3xl": "1700px",
        "4xl": "2000px",
      },
      width: {
        "message-xs": "450px",
        "message-sm": "550px",
        "message-default": "740px",
        searchbar: "850px",
      },
      maxWidth: {
        "message-max": "850px",
        "content-max": "725px",
        "searchbar-max": "800px",
      },
    },
  },
  plugins: [
    require("@tailwindcss/typography"),
    plugin(({ addVariant }) => {
      addVariant("focus-within-nonactive", "&:focus-within:not(:active)");
    }),
    plugin(({ addUtilities }) => {
      addUtilities({
        ".break-anywhere": { "overflow-wrap": "anywhere" },
      });
    }),
  ],
};
