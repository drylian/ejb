import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import type { KirePlugin } from "kire";
import { compile } from "tailwindcss";

export type TailwindCompileOptions = Parameters<typeof compile>[1];

const require = createRequire(import.meta.url);

/**
 * Loads CSS stylesheets for Tailwind processing
 */
async function loadStylesheet(id: string, base: string) {
	// Handle tailwindcss core stylesheet
	if (id === "tailwindcss") {
		try {
			const path = require.resolve("tailwindcss/index.css");
			const content = await readFile(path, "utf-8");
			return { base: dirname(path), content, path };
		} catch (e) {
			console.error("Failed to resolve tailwindcss/index.css", e);
		}
	}

	// Resolve other imports (relative paths or node_modules)
	try {
		const path = require.resolve(id, { paths: [base] });
		const content = await readFile(path, "utf-8");
		return { base: dirname(path), content, path };
	} catch (_e) {
		// Silently ignore resolution errors for other files
		return { base, content: "", path: "" };
	}
}

/**
 * Helper to extract the default export from a module
 */
function getModuleExport(module: any) {
	if (module && typeof module === "object" && "default" in module) {
		return module.default;
	}
	return module;
}

/**
 * Loads JavaScript modules for Tailwind configuration
 */
async function loadModule(id: string, base: string) {
	const baseRequire = createRequire(resolve(base, "index.js"));
	try {
		// Try direct require first (CJS) - this preserves context better for peer deps
		// in some package managers (like Bun/PNPM) compared to resolving path first.
		const mod = baseRequire(id);
		return {
			path: baseRequire.resolve(id),
			base,
			module: getModuleExport(mod),
		};
	} catch (e: any) {
		// If it's an ESM module, require() will fail. Use import() instead.
		if (e.code === "ERR_REQUIRE_ESM") {
			const resolvedPath = baseRequire.resolve(id);
			const module = await import(resolvedPath);
			return {
				path: resolvedPath,
				base: dirname(resolvedPath),
				module: getModuleExport(module),
			};
		}

		// Fallback: Manual resolution via package.json
		// This helps when require(id) fails for other reasons or custom entry point logic is needed
		try {
			// Try to resolve package.json to find the correct entry point
			try {
				const pkgJsonPath = require.resolve(`${id}/package.json`, {
					paths: [base],
				});
				const pkgJson = JSON.parse(await readFile(pkgJsonPath, "utf-8"));
				const main = pkgJson.main || pkgJson.module || "index.js";
				const entryPath = join(dirname(pkgJsonPath), main);
				const module = await import(entryPath);
				return {
					path: entryPath,
					base: dirname(entryPath),
					module: getModuleExport(module),
				};
			} catch {
				// Final fallback to standard resolution if package.json resolution fails
				const resolvedPath = require.resolve(id, { paths: [base] });
				const module = await import(resolvedPath);
				return {
					path: resolvedPath,
					base: dirname(resolvedPath),
					module: getModuleExport(module),
				};
			}
		} catch (loadError) {
			console.error(`Failed to load module "${id}" from "${base}"`, loadError);
			throw loadError;
		}
	}
}

export const KireTailwind: KirePlugin<NonNullable<TailwindCompileOptions>> = {
	name: "@kirejs/tailwind",
	sort: 110,
	options: {},
	async load(kire, opts) {
		const tailwindOptions: TailwindCompileOptions = {
			...opts,
			loadStylesheet,
			loadModule,
			from: undefined,
		};

		const cache = kire.cached<string>("@kirejs/tailwind");

		/**
		 * @tailwind directive for processing CSS with Tailwind
		 */
		kire.directive({
			name: "tailwind",
			params: ["code:string"],
			children: true,
			childrenRaw: true,
			description: "Processes CSS content within the block using Tailwind CSS.",
			example:
				"@tailwind\n  @tailwind base;\n  @tailwind components;\n  @tailwind utilities;\n@end",
			async onCall(ctx) {
				try {
					let code = ctx.param("code");

					// Fallback to children content if no parameter provided
					if (!code && ctx.children && ctx.children.length > 0) {
						code = ctx.children.map((c) => c.content || "").join("");
					}

					// Use default Tailwind import if no code provided
					if (!code || !code.trim()) {
						code = '@import "tailwindcss";';
					}

					// Generate cache ID if caching is enabled
					if (kire.cache) {
						const hash = createHash("sha256").update(code).digest("hex");
						ctx.raw(`$ctx.res('<tailwind id="${hash}">');`);
					} else {
						ctx.raw('$ctx.res("<tailwind>");');
					}

					ctx.raw(`$ctx.res(${JSON.stringify(code)});`);
					ctx.raw('$ctx.res("</tailwind>");');
				} catch (error) {
					console.warn("Tailwind directive error:", error);
					// Fallback behavior
					const code = ctx.param("code") || "";
					ctx.raw('$ctx.res("<tailwind>");');
					ctx.raw(`$ctx.res(${JSON.stringify(code)});`);
					ctx.raw('$ctx.res("</tailwind>");');
				}
			},
		});

		/**
		 * <tailwind> element for CSS content processing
		 */
		kire.element({
			name: "tailwind",
			description: "Processes CSS content within the block using Tailwind CSS.",
			example:
				"<tailwind>@tailwind base; @tailwind components; @tailwind utilities;</tailwind>",
			async onCall(ctx) {
				try {
					const id = ctx.element.attributes.id;

					// Use cached CSS if available and caching is enabled
					if (kire.cache && id && cache.has(id)) {
						const cachedCss = cache.get(id) ?? "";
						const newHtml = ctx.content.replace(
							ctx.element.outer,
							`<style>${cachedCss}</style>`,
						);
						ctx.update(newHtml);
						return;
					}

					// Compilation logic (cache miss or caching disabled)
					let content = ctx.element.inner || "";

					// Ensure Tailwind CSS is imported if not present
					if (!content.includes('@import "tailwindcss"')) {
						content = `@import "tailwindcss";\n${content}`;
					}

					// Extract CSS classes from the entire HTML content
					const candidates = new Set<string>();
					const classRegex = /\bclass(?:Name)?\s*=\s*(["'])(.*?)\1/g;
					let match: RegExpExecArray;

					while ((match = classRegex.exec(ctx.content)!) !== null) {
						const cls = match[2]?.split(/\s+/);
						cls?.forEach((c) => {
							if (c) candidates.add(c);
						});
					}

					const processedCSS = await compileCSSWithTailwind(
						content,
						tailwindOptions,
						Array.from(candidates),
					);

					// Cache the result if caching is enabled
					if (kire.cache && id) {
						cache.set(id, processedCSS);
					}

					const newHtml = ctx.content.replace(
						ctx.element.outer,
						`<style>${processedCSS}</style>`,
					);
					ctx.update(newHtml);
				} catch (error) {
					console.warn("Tailwind compilation error:", error);
					// Fallback: use original content without processing
					const newHtml = ctx.content.replace(
						ctx.element.outer,
						`<style>${ctx.element.inner || ""}</style>`,
					);
					ctx.update(newHtml);
				}
			},
		});
	},
};

/**
 * Processes CSS using Tailwind's compilation API
 */
async function compileCSSWithTailwind(
	css: string,
	options: TailwindCompileOptions,
	candidates: string[] = [],
): Promise<string> {
	try {
		if (!css || !css.trim()) return "";

		const result = await compile(css, options);
		const processedCSS = result.build(candidates);

		return processedCSS;
	} catch (error) {
		console.error("Error in Tailwind compilation:", error);
		throw error;
	}
}

export default KireTailwind;
