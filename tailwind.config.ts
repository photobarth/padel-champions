import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        court: {
          DEFAULT: "#1b6b4a",
          light: "#e8f5ee",
        },
      },
    },
  },
  plugins: [],
};

export default config;
