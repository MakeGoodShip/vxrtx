import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  integrations: [
    starlight({
      title: "vxrtx docs",
      logo: {
        src: "./src/assets/icon.svg",
      },
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/vxrtx",
        },
      ],
      sidebar: [
        {
          label: "Getting Started",
          autogenerate: { directory: "getting-started" },
        },
        {
          label: "Features",
          autogenerate: { directory: "features" },
        },
        {
          label: "Configuration",
          autogenerate: { directory: "config" },
        },
      ],
      customCss: ["./src/styles/custom.css"],
    }),
  ],
  site: "https://docs.vxrtx.app",
});
