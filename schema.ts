import { Kire } from "./core/src/index";
import { glob } from "glob";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";

async function generate() {
    console.log("🔍 Discovering packages...");
    // We look for packages/ and core/
    const packages = await glob(["packages/*", "core"]);

    for (const pkgPath of packages) {
        const pkgJsonPath = join(pkgPath, "package.json");
        if (!existsSync(pkgJsonPath)) continue;

        const pkgJson = JSON.parse(await readFile(pkgJsonPath, "utf-8"));
        const name = pkgJson.name;
        const version = pkgJson.version;
        const repo = pkgJson.repository;

        console.log(`\n📦 Processing ${name}...`);

        try {
            // Determine if it's Core or a Plugin
            if (name === "kire") {
                // Core: Load with defaults
                const kire = new Kire();
                const schema = kire.pkgSchema(name, repo, version);
                
                const outPath = join(pkgPath, "kire-schema.json");
                await writeFile(outPath, JSON.stringify(schema, null, 4));
                console.log(`✅ Generated kire-schema.json for ${name}`);
            } else {
                // Plugin: Load WITHOUT defaults to capture only plugin directives
                const kire = new Kire({ directives: false });

                // Try to find entry point
                const entry = join(pkgPath, "src/index.ts");
                if (!existsSync(entry)) {
                    console.log(`⚠️  No src/index.ts found for ${name}, skipping.`);
                    continue;
                }

                // Dynamic import
                const mod = await import(resolve(entry));
                const plugin = mod.default;

                if (!plugin) {
                    console.log(`⚠️  No default export found in ${entry}, skipping.`);
                    continue;
                }

                // Verify it looks like a plugin (has load method or is function)
                if (typeof plugin === 'object' && typeof plugin.load === 'function' || typeof plugin === 'function') {
                    // Load plugin
                    kire.plugin(plugin);

                    // Generate schema
                    const schema = kire.pkgSchema(name, repo, version);

                    const outPath = join(pkgPath, "kire-schema.json");
                    await writeFile(outPath, JSON.stringify(schema, null, 4));
                    console.log(`✅ Generated kire-schema.json for ${name}`);
                } else {
                    console.log(`⚠️  Default export is not a recognized Kire plugin in ${entry}.`);
                }
            }
        } catch (e) {
            console.error(`❌ Error processing ${name}:`, e);
        }
    }
}

generate();
