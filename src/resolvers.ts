import { readFile } from "node:fs/promises";

/**
 * Creates a file resolver function for Node.js environments
 * @returns A resolver function that handles file reading
 *
 * @example
 * // Async resolver
 * const asyncResolver = EJBNodeJSResolver();
 */
export const EJBNodeJSResolver = () => {
	return (importpath: string) => {
		const encoding = { encoding: "utf-8" } as const;
		return readFile(importpath, encoding);
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
