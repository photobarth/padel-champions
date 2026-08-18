import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        court: {
          DEFAULT: "#E30513",
          light: "#fce8e9",
        },
      },
    },
  },
  plugins: [],
};

export default config;
