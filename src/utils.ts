import { ESCAPE_HTML, ESPACE_HTML_REGEX } from "./constants";
import type { AnyEjb } from "./types";

/**
 * Reference to the AsyncFunction constructor
 */
export const AsyncFunction = Object.getPrototypeOf(
	async () => {},
).constructor;

/**
 * Escapes special regex characters in a string
 * @param string - The string to escape
 * @returns The escaped string
 */
export function escapeRegExp(string: string): string {
	// From MDN
	return string.replace(/[.*+\-?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Wraps template code in an Ejb function wrapper
 * @param ejb - The Ejb instance
 * @param str - The code string to wrap
 * @returns Wrapped function code
 */
export function returnEjbRes(ejb: AnyEjb, str: string): string {
	return `(${ejb.async ? "await" : ""}(${ejb.async ? "async" : ""}($ejb) => {${str}; return $ejb.res})({...$ejb, res:''}))`;
}

/**
 * Resolves promises and applies transformers in sequence
 * @template Input - Input type
 * @template Output - Output type (defaults to Input)
 * @param data - Input data (can be promise)
 * @param transformers - Array of transformation functions
 * @returns Transformed output (wrapped in promise if async)
 */
export function PromiseResolver<Input, Output = Input>(
	data: Input | Promise<Input>,
	...transformers: Array<(value: any) => any>
): Output | Promise<Output> {
	const apply = (value: any, index = 0): any => {
		if (index >= transformers.length) return value;
		const transformed = transformers[index](value);
		return isPromise(transformed)
			? transformed.then((v) => apply(v, index + 1))
			: apply(transformed, index + 1);
	};

	return isPromise(data) ? data.then((v) => apply(v)) : apply(data);
}

/**
 * Joins path segments and normalizes the resulting path
 * @param segments - Path segments to join
 * @returns Normalized path string
 */
export function join(...segments: string[]): string {
	if (!segments.length) return ".";

	const windowsAbsoluteRegex = /^[a-zA-Z]:[\\/]/;
	const isWindowsAbsolute = segments.some((s) => windowsAbsoluteRegex.test(s));
	const driveLetter = isWindowsAbsolute
		? segments
				.find((s) => windowsAbsoluteRegex.test(s))
				?.charAt(0)
				.toUpperCase()
		: null;

	let normalized = segments
		.map((s) => s.replace(/\\/g, "/").replace(/\/+/g, "/"))
		.join("/")
		.replace(/\/+/g, "/");

	if (isWindowsAbsolute && driveLetter) {
		normalized = normalized.replace(/^[a-zA-Z]:/, driveLetter);
	}
	const isAbsolute = /^(?:\/|[a-zA-Z]:\/)/.test(normalized);

	const parts = normalized
		.split("/")
		.filter((part) => part && part !== ".")
		.reduce((acc, part) => {
			return part === ".."
				? acc.length && acc[acc.length - 1] !== ".."
					? acc.slice(0, -1)
					: [...acc, part]
				: [...acc, part];
		}, [] as string[]);

	let path = parts.join("/");

	if (isWindowsAbsolute) {
		path = path
			.replace(/^([a-zA-Z]:)/, (_, drive) => `${drive.toUpperCase()}/`)
			.replace(/^\//, `${driveLetter}:/`)
			.replace(/\//g, "\\");

		path = path.replace(/\\+/g, "\\");
		return path || ".";
	}

	if (isAbsolute) path = "/" + path.replace(/^\//, "");
	if (path === "") return ".";

	return path;
}

/**
 * Resolves file paths with aliases and extensions
 * @param ejb - The Ejb instance
 * @param filepath - The path to resolve
 * @param currentFile - Optional current file path for relative resolution
 * @returns Resolved file path
 */
export const filepathResolver = (
	ejb: AnyEjb,
	filepath: string,
	currentFile?: string,
): string => {
	if (!filepath) return filepath;

	filepath = filepath.replace(/\\/g, "/").replace(/\/+/g, "/");
	const root = (ejb.root || ".").replace(/\\/g, "/").replace(/\/$/, "");

	const isAbsolute = /^(?:\/|[a-zA-Z]:\/)/.test(filepath);

	const aliasMatch = Object.entries(ejb.aliases)
		.sort(([a], [b]) => b.length - a.length)
		.find(([alias]) =>
			new RegExp(`^${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(
				filepath,
			),
		);

	if (aliasMatch) {
		const [alias, replacement] = aliasMatch;
		filepath = join(replacement, filepath.slice(alias.length));
	} else if (!isAbsolute) {
		const base = currentFile ? currentFile.replace(/\/[^/]*$/, "") : root;
		filepath = join(base, filepath);
	}

	if (ejb.extension && !/\.[^/.]+$/.test(filepath)) {
		const ext = ejb.extension.startsWith(".")
			? ejb.extension
			: `.${ejb.extension}`;
		filepath = filepath + ext;
	}

	return filepath.replace(/\/+/g, "/");
};

/**
 * Escapes JavaScript string content for template literals
 * @param str - The string to escape
 * @returns Escaped string
 */
export const escapeJs = (str: string): string =>
	str.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");

/**
 * Generates a simple hash from a string
 * @param str - Input string
 * @returns Numeric hash string
 */
export function simpleHash(str: string): string {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash |= 0;
	}
	return String(Math.abs(hash));
}

/**
 * Generates a unique ID with prefix
 * @param prefix - ID prefix
 * @returns Generated unique ID
 */
export function generateId(prefix: string): string {
	const timestamp = Date.now().toString(36);
	const random = Math.random().toString(36).substring(2, 8);
	return `${prefix.replace(/[^a-zA-Z0-9]/g, "_")}_${timestamp}_${random}`.toLowerCase();
}

/**
 * Escapes HTML special characters
 * @param value - Value to escape
 * @returns Escaped HTML string
 */
export function escapeHtml(value: any): string {
	if (value === null || value === undefined) return "";
	return String(value).replace(
		ESPACE_HTML_REGEX,
		(match) => ESCAPE_HTML[match as keyof typeof ESCAPE_HTML],
	);
}

/**
 * Type guard for Promise objects
 * @template T - Promise result type
 * @param p - Value to check
 * @returns True if value is a Promise
 */
export function isPromise<T>(p: any): p is Promise<T> {
	return p !== null && typeof p === "object" && typeof p.then === "function";
}
