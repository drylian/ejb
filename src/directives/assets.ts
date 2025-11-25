import { ejbDirective } from "../constants";
import { escapeHtml } from "../utils";

export default ejbDirective({
	name: "assets",
	children: false,
	onParams: (ejb) => {
		// Handle Production mode (default)
		const manifest = ejb.manifest;
		if (!manifest || Object.keys(manifest).length === 0) {
			ejb.builder.add(`$ejb.res += \`<!-- [EJB] Manifest not loaded or empty -->\`;`);
			return;
		}

		const allAssets = new Set<string>();

		for (const entry of Object.values(manifest)) {
			if (entry.assets && Array.isArray(entry.assets)) {
				(entry.assets as any[]).map((asset) => allAssets.add(asset));
			}
		}

		let html = "";
		for (const asset of allAssets) {
			if (asset.endsWith(".css")) {
				html += `<link rel="stylesheet" href="/${asset}">\n`;
			} else if (asset.endsWith(".js")) {
				html += `<script src="/${asset}" defer></script>\n`;
			}
		}

		ejb.builder.add(`$ejb.res += \`${escapeHtml(html)}\`;`);
	},
});
