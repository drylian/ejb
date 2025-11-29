import { Kire } from "kire";
import KireSsg from "@kirejs/ssg";
import KireAssets from "@kirejs/assets";
import KireTailwind from "@kirejs/tailwind";
import KireMarkdown from "@kirejs/markdown";
import KireIconify from "@kirejs/iconify";
import KireAnalytical from "@kirejs/analytical";
import { readFile } from "fs/promises";
import { resolve } from "path";

const kire = new Kire({
  root: resolve(process.cwd(), "src"),
  plugins: [
    KireAnalytical,
    [KireSsg, { assetsPrefix: "assets" }],
    KireMarkdown,
    KireIconify,
    [KireTailwind, {
      // Tailwind config overrides if needed, usually autodetected from css @import or passed here
    }],
    [KireAssets, { prefix: "assets" }]
  ],
  resolver: async (path) => {
      try {
          // console.log("Resolving:", path);
          return await readFile(path, 'utf-8');
      } catch (e) {
          // console.log("Failed:", path);
          throw new Error(`Template not found: ${path}`);
      }
  }
});

if (process.argv.includes("--dev")) {
  console.log("Starting dev server...");
  await KireSsg.dev({ port: 3000 });
} else {
  console.log("Building docs...");
  await KireSsg.build({ out: "dist" });
  console.log("Build complete.");
}
