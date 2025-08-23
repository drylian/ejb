import { ESCAPE_HTML, ESPACE_HTML_REGEX } from "../constants";

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
 * Escapes string
 */
export function escapeString(str: string) {
	if (typeof str !== "string") return str;

	return str
		.replace(/\\/g, "\\\\")
		.replace(/'/g, "\\'")
		.replace(/"/g, '\\"')
		.replace(/\n/g, "\\n")
		.replace(/\r/g, "\\r")
		.replace(/\t/g, "\\t")
		.replace(/\f/g, "\\f")
		.replace(/\b/g, "\\b")
		.replace(/\v/g, "\\v");
}

/**
 * Escapes JavaScript string content for template literals
 * @param str - The string to escape
 * @returns Escaped string
 */
export const escapeJs = (str: string): string =>
	str.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");

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
