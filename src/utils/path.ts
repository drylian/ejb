import type { AnyEjb } from "../types";

/**
 * Joins path segments and normalizes the resulting path
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

	// Normalize all segments at once
	const normalized = segments
		.join("/")
		.replace(/\\/g, "/")
		.replace(/\/+/g, "/");
	const isAbsolute = /^(?:\/|[a-zA-Z]:\/)/.test(normalized);

	const parts = normalized.split("/");
	const result: string[] = [];
	let i = 0;

	while (i < parts.length) {
		const part = parts[i++];
		if (!part || part === ".") continue;

		if (part === "..") {
			if (result.length && result[result.length - 1] !== "..") {
				result.pop();
			} else {
				result.push(part);
			}
		} else {
			result.push(part);
		}
	}

	let path = result.join("/");

	if (isWindowsAbsolute && driveLetter) {
		path = path.replace(/^[a-zA-Z]:/, "").replace(/^\//, "");
		path = `${driveLetter}:\\${path.replace(/\//g, "\\")}`.replace(
			/\\+/g,
			"\\",
		);
		return path || ".";
	}

	return isAbsolute ? `/${path.replace(/^\//, "")}` : path || ".";
}

/**
 * Resolves file paths with aliases and extensions
 */
export const filepathResolver = (
	ejb: AnyEjb,
	filepath: string,
	currentFile?: string,
): string => {
	if (!filepath) return filepath;

	// Fast path normalization
	let resolved = filepath.replace(/\\/g, "/").replace(/\/+/g, "/");
	const root = (ejb.root || ".").replace(/\\/g, "/").replace(/\/$/, "");

	// Check if absolute - including Windows absolute paths
	const _isAbsolute = /^(?:\/|[a-zA-Z]:\/)/.test(resolved);
	const isWindowsAbsolute = /^[a-zA-Z]:\//.test(resolved);

	// Handle aliases with while loop
	const aliases = Object.entries(ejb.aliases);
	let aliasIndex = aliases.length - 1;

	// Sort by length descending using while
	while (aliasIndex > 0) {
		let j = 0;
		while (j < aliasIndex) {
			if (aliases[j][0].length < aliases[j + 1][0].length) {
				[aliases[j], aliases[j + 1]] = [aliases[j + 1], aliases[j]];
			}
			j++;
		}
		aliasIndex--;
	}

	// Find matching alias with while
	let i = 0;
	while (i < aliases.length) {
		const [alias, replacement] = aliases[i];
		const escapedAlias = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		if (new RegExp(`^${escapedAlias}`).test(filepath)) {
			resolved = join(replacement, filepath.slice(alias.length));
			break;
		}
		i++;
	}

	const isResolvedAbsolute = /^(?:\/|[a-zA-Z]:\/)/.test(resolved);
	if (!isResolvedAbsolute && !isWindowsAbsolute) {
		const base = currentFile
			? currentFile.replace(/\\/g, "/").replace(/\/[^/]*$/, "")
			: root;
		resolved = join(base, resolved);
	}

	// Add extension if needed
	if (ejb.extension && !/\.[^/.]+$/.test(resolved)) {
		const ext =
			ejb.extension.charAt(0) === "." ? ejb.extension : `.${ejb.extension}`;
		resolved += ext;
	}

	return resolved.replace(/\/+/g, "/");
};
