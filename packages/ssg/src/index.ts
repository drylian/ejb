import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, join, relative, resolve } from "node:path";
import { glob } from "glob";
import type { Kire, KirePlugin } from "kire";
import type { KireAsset } from "@kirejs/assets";

declare module "kire" {
	interface Kire {
		parseMarkdown?(content: string): Promise<string>;
	}
}

// Singleton instance to hold Kire reference
let kireInstance: Kire | null = null;
let assetsPrefix = "_kire";

interface SsgOptions {
	assetsPrefix?: string;
}

interface BuildOptions {
	out: string;
	dir?: string; // Source directory relative to root, defaults to root
}

export const KireSsg: KirePlugin<SsgOptions> & {
	build: (opts: BuildOptions) => Promise<void>;
	dev: (opts?: { port?: number }) => Promise<void>;
} = {
	name: "@kirejs/ssg",
	options: {},
	load(kire: Kire, opts) {
		kireInstance = kire;
		if (opts?.assetsPrefix) {
			assetsPrefix = opts.assetsPrefix.replace(/^\//, "").replace(/\/$/, "");
		}
	},

	async build(opts: BuildOptions) {
		if (!kireInstance)
			throw new Error(
				"KireSsg plugin not registered or Kire instance not ready.",
			);

		const outDir = resolve(opts.out);
		const rootDir = resolve(kireInstance.root);

		console.log(`Building to ${outDir}...`);

		await mkdir(outDir, { recursive: true });

		// Helper to crawl
		async function getFiles(dir: string): Promise<string[]> {
			const dirents = await readdir(dir, { withFileTypes: true });
			const files = await Promise.all(
				dirents.map(async (dirent) => {
					const res = resolve(dir, dirent.name);
					if (dirent.isDirectory()) {
						return getFiles(res);
					} else {
						return res;
					}
				}),
			);
			return Array.prototype.concat(...files);
		}

		const allFiles = await getFiles(rootDir);
		const ext = kireInstance.extension.startsWith(".")
			? kireInstance.extension
			: `.${kireInstance.extension}`;

		const templateFiles = allFiles.filter((f) => f.endsWith(ext));

		for (const file of templateFiles) {
			const relativePath = relative(rootDir, file);
			if (relativePath.split("/").some((p) => p.startsWith("_"))) continue;

			try {
				// 1. Render the template to check for generator markers
				// Pass a default empty string for currentPath during detection pass
				const html = await kireInstance.render(file, { currentPath: "" });

				// Check for marker
				const markerRegex = /<!-- KIRE_GEN:(.*?) -->/;
				const match = html.match(markerRegex);

				if (match) {
					const globPattern = match[1];
					console.log(
						`> Detected Generator in ${relativePath} for '${globPattern}'`,
					);

					// Find markdown files
					const mdFiles = await glob(globPattern!, { cwd: rootDir });

					for (const mdFile of mdFiles) {
						const mdRelative = String(mdFile);
						
						// Render template again with currentPath local
						const pageHtml = await kireInstance.render(file, {
							currentPath: mdRelative
						});

						// Remove the marker from final output
						// The directive output the marker, so it is in pageHtml.
						const finalHtml = pageHtml.replace(match[0], "");

						// Output: dist/path/to/file.html
						const htmlOutPath = mdRelative.replace(/\.(md|markdown)$/, ".html");
						const fullOutPath = join(outDir, htmlOutPath);

						await mkdir(dirname(fullOutPath), { recursive: true });
						await writeFile(fullOutPath, finalHtml);
						console.log(`  -> Generated ${htmlOutPath}`);
					}
				} else {
					// Normal file
					const htmlPath = relativePath.replace(
						new RegExp(`\\${ext}$`),
						".html",
					);
					const outPath = join(outDir, htmlPath);

					await mkdir(dirname(outPath), { recursive: true });
					await writeFile(outPath, html);
					console.log(`✓ ${htmlPath}`);
				}
			} catch (e: any) {
				console.error(`✗ Failed to render ${relativePath}:`, e.message);
			}
		}

		// Write assets
		        // Write assets
		        const assetsCache = kireInstance.cached<KireAsset>("@kirejs/assets");
		        // Check if we have assets by trying to iterate or checking size logic?
		        // Map has size, but KireCache wrapper doesn't expose size.
		        // But we can iterate.
		        const entries = Array.from(assetsCache.entries());
		
		        if (entries.length > 0) {
		            const assetsDir = join(outDir, assetsPrefix);
		            await mkdir(assetsDir, { recursive: true });
		
		            for (const [hash, asset] of entries) {
		                const filename = `${hash}.${asset.type === "css" ? "css" : asset.type === "mjs" ? "mjs" : "js"}`;
		                await writeFile(join(assetsDir, filename), asset.content);
		                console.log(`✓ Asset: ${assetsPrefix}/${filename}`);
		            }
		        }
		
		        console.log("Build complete.");
		    },
	async dev(opts = {}) {
		if (!kireInstance) throw new Error("KireSsg plugin not registered.");

		const port = opts.port || 3000;

		const server = createServer(async (req, res) => {
			const url = req.url || "/";
			console.log(`[DEV] Request: ${req.method} ${url}`);

			try {
				// Handle assets
				const prefixPath = `/${assetsPrefix}/`;
				if (url.startsWith(prefixPath)) {
					console.log(`[DEV] Attempting to serve asset: ${url}`);
					const match = url.match(/\/([a-f0-9]{8})\.(js|css|mjs)$/);
					if (match) {
						const hash = match[1];
						const ext = match[2] as "js" | "css" | "mjs";
						const assetsCache = kireInstance!.cached<KireAsset>("@kirejs/assets");
						const asset = assetsCache.get(hash!);
						if (asset && asset.type === ext) {
							res.setHeader(
								"Content-Type",
								ext === "css" ? "text/css" : "application/javascript",
							);
							res.end(asset.content);
							console.log(`[DEV] Served asset: ${url}`);
							return;
						}
					}
					// If match failed or asset not found in cache
					console.warn(`[DEV] Asset not found in cache: ${url}`);
					res.statusCode = 404;
					res.end("Asset Not Found");
					return;
				}

				// Handle pages
				let baseFilename = url === "/" ? "index" : url.substring(1);
				if (baseFilename.endsWith(".html"))
					baseFilename = baseFilename.slice(0, -5);

				const candidates = [
					baseFilename,
					`${baseFilename}/index`,
					`pages/${baseFilename}`,
					`pages/${baseFilename}/index`,
				];

				let html: string | null | undefined = null;
				let servedCandidate = "";

				for (const candidate of candidates) {
					try {
						// console.log(`[DEV] Trying candidate: ${candidate}`);
						html = await kireInstance?.render(candidate);
						servedCandidate = candidate;
						break;
					} catch (e: any) {
						if (
							e.message.includes("No resolver") ||
							e.message.includes("ENOENT") ||
							e.message.includes("Template not found")
						) {
							continue;
						}
						throw e; // Re-throw unexpected errors
					}
				}

				if (html !== null) {
					res.setHeader("Content-Type", "text/html");
					res.end(html);
					console.log(
						`[DEV] Served template: ${servedCandidate} (Request: ${url})`,
					);
				} else {
					console.warn(
						`[DEV] Template not found (404): ${url}. Tried: ${candidates.join(", ")}`,
					);
					res.statusCode = 404;
					res.end(`Not Found: ${req.url}`);
				}
			} catch (e: any) {
				if (
					e.message.includes("No resolver") ||
					e.message.includes("ENOENT") ||
					e.message.includes("Template not found")
				) {
					console.warn(`[DEV] Template not found (404): ${req.url}`);
					res.statusCode = 404;
					res.end(`Not Found: ${req.url}`);
				} else {
					console.error(`[DEV] Internal Server Error (500) for ${req.url}:`, e);
					res.statusCode = 500;
					res.end("Internal Server Error");
				}
			}
		});

		server.listen(port, () => {
			console.log(`Server running at http://localhost:${port}`);
		});

		return new Promise(() => {});
	},
};

export default KireSsg;
