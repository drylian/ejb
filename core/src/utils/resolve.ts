import { join } from "./path";

export function resolvePath(
	filepath: string,
	root: string,
	alias: Record<string, string>,
	extension?: string,
	currentFile?: string,
): string {
	if (!filepath) return filepath;

	if (filepath.startsWith("http://") || filepath.startsWith("https://")) {
		return filepath;
	}

	let resolved = filepath.replace(/\\/g, "/").replace(/(?<!:)\/+/g, "/");
	const normalizedRoot = root.replace(/\\/g, "/").replace(/\/\/$/, "");

	const isWindowsAbsolute = /^[a-zA-Z]:\/$/.test(resolved);

	const aliases = Object.entries(alias);
	aliases.sort((a, b) => b[0].length - a[0].length);

	let matchedAlias = false;
	for (const [aliasKey, replacement] of aliases) {
		const escapedAlias = aliasKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		if (new RegExp(`^${escapedAlias}`).test(filepath)) {
			resolved = join(replacement, filepath.slice(aliasKey.length));
			matchedAlias = true;
			break;
		}
	}

	if (matchedAlias) {
		// handled
	} else {
		const isResolvedAbsolute = /^(?:\/|[a-zA-Z]:\/)/.test(resolved);
		if (!isResolvedAbsolute && !isWindowsAbsolute) {
			const base = currentFile
				? currentFile.replace(/\\/g, "/").replace(/\/[^/]*$/, "")
				: normalizedRoot;
			resolved = join(base, resolved);
		}
	}

	if (
		extension &&
		!/\.[^/.]+$/.test(resolved) &&
		!(resolved.startsWith("http://") || resolved.startsWith("https://"))
	) {
		const ext = extension.charAt(0) === "." ? extension : `.${extension}`;
		resolved += ext;
	}

	return resolved.replace(/\/+/g, "/");
}
