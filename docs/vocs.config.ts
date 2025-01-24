import { defineConfig } from "vocs";
import svgr from "vite-plugin-svgr";

export default defineConfig({
  title: "Daydreams Documentation",
  description: "Daydreams | generative agents",
  iconUrl: "/favicon-32x32.png",
  logoUrl: "/banner.png",
  font: {
    google: "Open Sans",
  },

  theme: {
    colorScheme: "dark",
    variables: {
      color: {
        textAccent: "#ee2d3f",
        background: "#0c0c0c",
        backgroundDark: "#121212",
        noteBackground: "#1a1a1a",
      },
    },
  },
  sidebar: [
    {
      text: "Getting Started",
      link: "/getting-started",
    },
    {
      text: "Example",
      link: "/example",
    },
  ],
  vite: {
    plugins: [svgr()],
  },
});
