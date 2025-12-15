import type { KirePlugin } from "../types";
import { md5 } from "../utils/md5";
import { resolvePath } from "../utils/resolve";
import componentDirectives from "./component";
import importDirectives from "./import";
import defineDirectives from "./layout";
import nativeDirectives from "./natives";

export const KireDirectives: KirePlugin = {
	name: "@kirejs/core",
	sort: 100,
	options: {},
	load(kire) {
		// Register internal helpers
		// add md5 function
		kire.$ctx("$md5", md5);
		kire.$ctx("$escape", escapeHtml);
		
		kire.$ctx(
			"$require",
			async (path: string, locals: Record<string, any> = {}) => {
				// Use absolute path for caching key to avoid conflicts
				const resolvedPath = resolvePath(
					path,
					kire.root,
					kire.alias,
					kire.extension,
				);

				const cached = kire.cached("@kirejs/core");
				const isProd = kire.production;
				const cachedHash = cached.get(`md5:${resolvedPath}`);
				let compiledFn: Function | undefined = cached.get(`js:${resolvedPath}`);
				let content = "";

				if (!cachedHash || !compiledFn || !isProd) {
					try {
						content = await kire.$resolver(resolvedPath);
					} catch (e: any) {
						if (!e.message.includes("No resolver")) {
							console.warn(`Failed to resolve path: ${resolvedPath}`, e);
						}
						return null; // Retorna null se não encontrar, para a diretiva lidar
					}

					if (!content) {
						return null;
					}

					const newHash = md5(content);

					if (cachedHash === newHash && compiledFn) {
						// Optimization: Content hasn't changed, reuse cached function
					} else {
						compiledFn = await kire.compileFn(content, resolvedPath);
						cached.set(`md5:${resolvedPath}`, newHash);
						cached.set(`js:${resolvedPath}`, compiledFn); // Cache a função compilada
					}
				}

				if (!compiledFn) return null; // Retorna null se a função não foi compilada/cacheada

				// Executa a função compilada com os locals e retorna o HTML
				// We need to cast kire to any or make run public to access it from here since it was private
				return (kire as any).run(compiledFn, locals);
			}
		);

		defineDirectives(kire);
		nativeDirectives(kire);
		importDirectives(kire);
		componentDirectives(kire);
	},
};

function escapeHtml(unsafe: any): string {
	if (unsafe === null || unsafe === undefined) return "";
	return String(unsafe)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}