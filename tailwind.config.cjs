import defaultTheme from "tailwindcss/defaultTheme";

/** @type {import('tailwindcss').Config} */
export default {
  content: ["src/**/*.{elm,html,js}"],
  theme: {
    extend: {
      fontFamily: {
        heading: ["Red Rose", ...defaultTheme.fontFamily.sans],
        label: ["Josefin Sans", ...defaultTheme.fontFamily.sans],
        menu: ["Oxanium", ...defaultTheme.fontFamily.sans],
        mono: ["Fira Code", ...defaultTheme.fontFamily.mono],
        sans: ["Nunito Sans", ...defaultTheme.fontFamily.sans],
        serif: ["Vollkorn", ...defaultTheme.fontFamily.serif],
        welcome: ["MonteCarlo", "cursive"],
      },
      transitionProperty: {
        "all-colors":
          "background-color, border-color, box-shadow, color, fill, opacity, outline, stroke",
      },
    },
    screens: {
      xs: "375px",
      ...defaultTheme.screens,
      tall: { raw: "(min-height: 800px)" },
    },
  },
  plugins: [
    require("@tailwindcss/typography"),
    require("@tailwindcss/forms"),
    require("@tailwindcss/container-queries"),
    require("@catppuccin/tailwindcss")({
      prefix: "cat",
      defaultFlavour: "latte",
    }),
  ],
};
