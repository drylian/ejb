import { mkdir, readdir, writeFile } from "node:fs/promises";
import { watch } from "node:fs";
import { createServer, type ServerResponse } from "node:http";
import { dirname, join, relative, resolve } from "node:path";
import { glob } from "glob";
import type { Kire, KirePlugin } from "kire";
import type { KireAsset } from "@kirejs/assets";
import { renderErrorPage } from "./error-page";

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

// Track file access for debugging
const fileAccessHistory: Array<{
	file: string;
	timestamp: Date;
	type: 'read' | 'write' | 'compile' | 'cache';
	duration?: number;
}> = [];

// Track route compilation chain
const routeCompilationChain: Map<string, string[]> = new Map();
let currentRoute: string | null = null;

// Create a proxy to track file accesses
function trackFileAccess(kire: Kire) {
	const originalCacheGet = kire.$files.get;
	const originalCacheSet = kire.$files.set;
	const originalCacheClear = kire.$files.clear;
	
	kire.$files.get = function(key: string) {
		const start = Date.now();
		const result = originalCacheGet.call(this, key);
		const duration = Date.now() - start;
		
		fileAccessHistory.push({
			file: key,
			timestamp: new Date(),
			type: 'cache',
			duration
		});
		
		// Track in compilation chain if we're processing a route
		if (currentRoute && !routeCompilationChain.has(currentRoute)) {
			routeCompilationChain.set(currentRoute, []);
		}
		if (currentRoute && !routeCompilationChain.get(currentRoute)?.includes(key)) {
			routeCompilationChain.get(currentRoute)?.push(key);
		}
		
		return result;
	};
	
	kire.$files.set = function(key: string, value: any) {
		fileAccessHistory.push({
			file: key,
			timestamp: new Date(),
			type: 'write'
		});
		return originalCacheSet.call(this, key, value);
	};
	
	kire.$files.clear = function() {
		fileAccessHistory.length = 0; // Clear history on cache clear
		routeCompilationChain.clear();
		return originalCacheClear.call(this);
	};
	
	// Track view compilation
	const originalView = kire.view.bind(kire);
	kire.view = async (template: string, data?: any) => {
		const prevRoute = currentRoute;
		currentRoute = template;
		const start = Date.now();
		
		try {
			fileAccessHistory.push({
				file: template,
				timestamp: new Date(),
				type: 'compile'
			});
			
			// Initialize chain for this route
			routeCompilationChain.set(template, [template]);
			
			const result = await originalView(template, data);
			const duration = Date.now() - start;
			
			// Update last entry with duration
			const lastEntry = fileAccessHistory[fileAccessHistory.length - 1];
			if (lastEntry && lastEntry.file === template) {
				lastEntry.duration = duration;
			}
			
			return result;
		} finally {
			currentRoute = prevRoute;
		}
	};
}

export const KireSsg: KirePlugin<SsgOptions> & {
	build: (opts: BuildOptions) => Promise<void>;
	dev: (opts?: { port?: number }) => Promise<void>;
	getFileAccessHistory: () => typeof fileAccessHistory;
	getRouteCompilationChain: () => Map<string, string[]>;
} = {
	name: "@kirejs/ssg",
	options: {},
	load(kire: Kire, opts) {
		kireInstance = kire;
		if (opts?.assetsPrefix) {
			assetsPrefix = opts.assetsPrefix.replace(/^\//, "").replace(/\/$/, "");
		}
		
		// Track file accesses
		trackFileAccess(kire);
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
				// Clear tracking for this build
				fileAccessHistory.length = 0;
				routeCompilationChain.clear();
				
				// 1. Render the template to check for generator markers
				const html = await kireInstance.view(file, { currentPath: "" });

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
						
						// Clear tracking for each generated page
						fileAccessHistory.length = 0;
						routeCompilationChain.clear();

						// Render template again with currentPath local
						const pageHtml = await kireInstance.view(file, {
							currentPath: mdRelative
						});

						// Remove the marker from final output
						const finalHtml = pageHtml.replace(match[0], "");

						// Output: dist/path/to/file.html
						const htmlOutPath = mdRelative.replace(/\.(md|markdown)$/, ".html");
						const fullOutPath = join(outDir, htmlOutPath);

						await mkdir(dirname(fullOutPath), { recursive: true });
						await writeFile(fullOutPath, finalHtml);
						console.log(`  -> Generated ${htmlOutPath}`);
						
						// Log compilation chain for this page
						const chain = routeCompilationChain.get(file);
						if (chain && chain.length > 0) {
							console.log(`  ├─ Compilation chain:`);
							chain.forEach((f, i) => {
								const prefix = i === chain.length - 1 ? '└─' : '├─';
								console.log(`  ${prefix} ${relative(rootDir, f)}`);
							});
						}
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
					
					// Log compilation chain
					const chain = routeCompilationChain.get(file);
					if (chain && chain.length > 0) {
						console.log(`  └─ Dependencies: ${chain.length - 1} file(s)`);
						if (chain.length > 1) {
							console.log(`     Chain: ${chain.slice(1).map(f => relative(rootDir, f)).join(' → ')}`);
						}
					}
				}
			} catch (e: any) {
				console.error(`✗ Failed to render ${relativePath}:`, e.message);
				
				// Show compilation chain that led to error
				const chain = routeCompilationChain.get(file);
				if (chain && chain.length > 0) {
					console.error(`  Compilation chain that failed:`);
					chain.forEach((f, i) => {
						const prefix = i === chain.length - 1 ? '└─[ERROR]' : '├─';
						console.error(`  ${prefix} ${relative(rootDir, f)}`);
					});
				}
			}
		}

		// Write assets
		const assetsCache = kireInstance.cached<KireAsset>("@kirejs/assets");
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
		
		// Print summary of file accesses
		console.log("\n📊 File Access Summary:");
		const uniqueFiles = new Set(fileAccessHistory.map(f => f.file));
		console.log(`Total unique files accessed: ${uniqueFiles.size}`);
		console.log(`Total file operations: ${fileAccessHistory.length}`);
		
		// Group by type
		const byType = fileAccessHistory.reduce((acc, curr) => {
			acc[curr.type] = (acc[curr.type] || 0) + 1;
			return acc;
		}, {} as Record<string, number>);
		
		Object.entries(byType).forEach(([type, count]) => {
			console.log(`  ${type}: ${count}`);
		});
	},

	async dev(opts = {}) {
		if (!kireInstance) throw new Error("KireSsg plugin not registered.");

		const port = opts.port || 3000;
		const clients: ServerResponse[] = [];
		const rootDir = resolve(kireInstance.root);

		// File Watcher
		let fsWait: Timer | boolean = false;
		watch(rootDir, { recursive: true }, (_event, filename) => {
			if (filename) {
				if (fsWait) return;
				fsWait = setTimeout(() => {
					fsWait = false;
				}, 100);

				console.log(`[DEV] File changed: ${filename}. Reloading clients...`);
				// Clear cache to ensure fresh render
				kireInstance!.cacheClear();

				// Notify clients
				clients.forEach(res => {
					res.write(`data: reload\n\n`);
				});
			}
		});

		const server = createServer(async (req, res) => {
			const url = req.url || "/";

			// SSE Endpoint
			if (url === "/kire-livereload") {
				res.writeHead(200, {
					"Content-Type": "text/event-stream",
					"Cache-Control": "no-cache",
					"Connection": "keep-alive",
				});
				res.write("data: connected\n\n");
				clients.push(res);

				req.on("close", () => {
					const idx = clients.indexOf(res);
					if (idx !== -1) clients.splice(idx, 1);
				});
				return;
			}

			console.log(`[DEV] Request: ${req.method} ${url}`);

			try {
				// Clear tracking for this request
				fileAccessHistory.length = 0;
				routeCompilationChain.clear();

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
						html = await kireInstance?.view(candidate);
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

					// Inject Live Reload Script
					const liveReloadScript = `
                        <script>
                            (() => {
                                const evtSource = new EventSource("/kire-livereload");
                                evtSource.onmessage = (event) => {
                                    if (event.data === "reload") {
                                        console.log("[Kire] Reloading...");
                                        window.location.reload();
                                    }
                                };
                                evtSource.onopen = () => console.log("[Kire] Live reload connected");
                                window.onbeforeunload = () => evtSource.close();
                            })();
                        </script>
                    `;

					if (html!.includes("</body>")) {
						html = html!.replace("</body>", `${liveReloadScript}</body>`);
					} else {
						html += liveReloadScript;
					}

					res.end(html);
					
					// Log compilation chain for this request
					console.log(`[DEV] ✓ 200 ${url} -> ${servedCandidate}`);
					const chain = routeCompilationChain.get(servedCandidate);
					if (chain && chain.length > 1) {
						console.log(`[DEV]   ├─ Compilation chain (${chain.length} files):`);
						chain.slice(0, 5).forEach((file, i) => {
							const relPath = relative(rootDir, file);
							const prefix = i === chain.length - 1 || i === 4 ? '└─' : '├─';
							console.log(`[DEV]   ${prefix} ${relPath} ${i === 0 ? '(entry)' : ''}`);
						});
						if (chain.length > 5) {
							console.log(`[DEV]   └─ ... and ${chain.length - 5} more files`);
						}
					}
				} else {
					const isNoise = url.includes("favicon.ico") || url.includes(".well-known") || url.includes(".map");
					if (!isNoise) {
						console.warn(
							`[DEV] ⚠ 404 ${url}`,
						);
					}
					res.statusCode = 404;
					res.end(`Not Found: ${req.url}`);
				}
			} catch (e: any) {
				if (
					e.message.includes("No resolver") ||
					e.message.includes("ENOENT") ||
					e.message.includes("Template not found")
				) {
					const isNoise = req.url?.includes("favicon.ico") || req.url?.includes(".well-known");
					if (!isNoise) {
						console.warn(`[DEV] ⚠ 404 ${req.url}`);
					}
					res.statusCode = 404;
					res.end(`Not Found: ${req.url}`);
				} else {
					console.error(`[DEV] ✗ 500 ${req.url}`);
					console.error(e);
					res.statusCode = 500;
					
					// Get cached files and compilation chain
					const cachedFiles = Array.from(kireInstance!.$files.keys());
					const chain = routeCompilationChain.get(currentRoute || '');
					
					const errorHtml = renderErrorPage({
						error: e,
						req,
						files: cachedFiles,
						kire: kireInstance!
					});
					
					// Log detailed compilation chain for debugging
					if (chain && chain.length > 0) {
						console.error(`[DEV]   Compilation chain that failed:`);
						chain.forEach((file, i) => {
							const relPath = relative(rootDir, file);
							const prefix = i === chain.length - 1 ? '└─[ERROR]' : '├─';
							console.error(`[DEV]   ${prefix} ${relPath} ${i === 0 ? '(entry)' : ''}`);
						});
						
						// Also show file access history
						console.error(`[DEV]   File access history (last 10):`);
						fileAccessHistory.slice(-10).forEach(access => {
							const relPath = relative(rootDir, access.file);
							console.error(`[DEV]     [${access.timestamp.toISOString().split('T')[1]!.slice(0, -1)}] ${access.type}: ${relPath} ${access.duration ? `(${access.duration}ms)` : ''}`);
						});
					}
					
					res.end(errorHtml);
				}
			}
		});

		server.listen(port, () => {
			console.log(`Server running at http://localhost:${port}`);
		});

		return new Promise(() => { });
	},
	
	// Expose tracking functions
	getFileAccessHistory() {
		return fileAccessHistory;
	},
	
	getRouteCompilationChain() {
		return routeCompilationChain;
	}
};

export default KireSsg;