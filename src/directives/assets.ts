import { ejbDirective } from "../constants";
import type { AnyEjb } from "../types";

export default ejbDirective({
    name: 'assets',
    children: false,
    onParams: (ejb: AnyEjb) => {
        // Handle Development/Depuration mode
        if (ejb.depuration) {
            let html = '';
            for (const [filepath, artefacts] of Object.entries(ejb.files)) {
                for (const artefact of artefacts) {
                    if (artefact.loader === 'css') {
                        html += `<style efl="${filepath}">\n${artefact.content}\n</style>\n`;
                    } else if (artefact.loader === 'client') {
                        html += `<script efl="${filepath}">\n${artefact.content}\n</script>\n`;
                    }
                }
            }
            return html;
        }

        // Handle Production mode (default)
        const manifest = ejb.manifest;
        if (!manifest || Object.keys(manifest).length === 0) {
            return "<!-- [EJB] Manifest not loaded or empty -->";
        }

        const allAssets = new Set<string>();

        for (const entry of Object.values(manifest)) {
            if (entry.assets && Array.isArray(entry.assets)) {
                (entry.assets as any[]).map(asset => allAssets.add(asset));
            }
        }
        
        let html = '';
        for (const asset of allAssets) {
            if (asset.endsWith('.css')) {
                html += `<link rel="stylesheet" href="/${asset}">\n`;
            } else if (asset.endsWith('.js')) {
                html += `<script src="/${asset}" defer></script>\n`;
            }
        }

        return html;
    }
});
