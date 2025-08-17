import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { IfAsync } from "./types";

/**
 * Creates a file resolver function for Node.js environments
 * @template Async - Boolean indicating if resolver should work in async mode
 * @param async - Optional flag to force async/sync mode (defaults to generic type)
 * @returns A resolver function that handles file reading
 *
 * @example
 * // Async resolver
 * const asyncResolver = EJBNodeJSResolver<true>();
 * // Sync resolver
 * const syncResolver = EJBNodeJSResolver<false>();
 */
export const EJBNodeJSResolver = <Async extends boolean = false>(
	async?: Async,
) => {
	return (importpath: string) => {
		try {
			const encoding = { encoding: "utf-8" } as const;
			return (
				async
					? readFile(importpath, encoding)
					: readFileSync(importpath, encoding)
			) as IfAsync<Async, string>;
		} catch (e) {
			console.error(`[EJB-IMPORT] Failed to resolve: ${importpath}`, e);
			return (async ? Promise.resolve("") : "") as IfAsync<Async, string>;
		}
	};
};

/**
 * File resolver implementation for Bun runtime environment
 * @param importpath - Path to the file to resolve
 * @returns Promise resolving to file contents or empty string on error
 *
 * @example
 * const content = await EJBBunResolver('./template.ejb');
 */
export const EJBBunResolver = async (importpath: string): Promise<string> => {
	try {
		const file = Bun.file(importpath);
		return (await file.exists()) ? await file.text() : "";
	} catch (e) {
		console.error(`[EJB-IMPORT] Failed to resolve: ${importpath}`, e);
		return "";
	}
};
