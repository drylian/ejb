import type { AnyEjb } from "../types";

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
		normalized = normalized.replace(/^[a-zA-Z]:/, `${driveLetter}:`);
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

	if (isAbsolute) path = `/${path.replace(/^\//, "")}`;
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
		const [alias, replacement] = aliasMatch as [string, string];
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
