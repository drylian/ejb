import { Kire } from "kire";
import KireSsg from "@kirejs/ssg";
import KireAssets from "@kirejs/assets";
import KireTailwind from "@kirejs/tailwind";
import KireMarkdown from "@kirejs/markdown";
import KireIconify from "@kirejs/iconify";
import KireAnalytical from "@kirejs/analytical";
import { readFile } from "fs/promises";
import { resolve, join } from "path";

// Determine paths relative to this script file
const docsRoot = import.meta.dir; // e.g. /path/to/kire/docs
const projectRoot = resolve(docsRoot, ".."); // e.g. /path/to/kire

console.log("Docs Root:", docsRoot);
console.log("Project Root:", projectRoot);

// Load schemas from workspace
const schemas: any[] = [];

// Helper to load schema
const loadSchema = async (path: string) => {
    try {
        const content = await readFile(path, "utf-8");
        return JSON.parse(content);
    } catch (e) {
        console.warn(`Failed to load schema at ${path}`);
        return null;
    }
};

// 1. Core
const coreSchemaPath = join(projectRoot, "core", "kire-schema.json");
const coreSchema = await loadSchema(coreSchemaPath);
if (coreSchema) schemas.push(coreSchema);
else console.warn("Core schema not found at", coreSchemaPath);

// 2. Packages
// Using Bun.Glob if available
if (typeof Bun !== "undefined") {
    // Glob is relative to cwd if no root specified, or scan(root)
    // We want to scan `packages/*/kire-schema.json` inside `projectRoot`
    const glob = new Bun.Glob("packages/*/kire-schema.json");
    for await (const file of glob.scan(projectRoot)) {
        const fullPath = join(projectRoot, file);
        const schema = await loadSchema(fullPath);
        if (schema) schemas.push(schema);
    }
} else {
    console.warn("Bun is not defined, skipping package scan.");
}

console.log(`Loaded ${schemas.length} schemas.`);

const kire = new Kire({
  root: resolve(docsRoot, "src"),
  plugins: [
    //KireAnalytical,
    KireMarkdown,
    KireIconify,
    [KireTailwind, {}],
    [KireAssets, { prefix: "assets" }],
    [KireSsg, { assetsPrefix: "assets" }],
  ],
  resolver: async (path) => {
      try {
          return await readFile(path, 'utf-8');
      } catch (e) {
          throw new Error(`Template not found: ${path}`);
      }
  },
});

// Inject schemas into global context
kire.$ctx("packages", schemas);

if (process.argv.includes("--dev")) {
  console.log("Starting dev server...");
  await KireSsg.dev({ port: 3000 });
} else {
  console.log("Building docs...");
  await KireSsg.build({ out: resolve(docsRoot, "dist") });
  console.log("Build complete.");
}
