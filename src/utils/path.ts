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
