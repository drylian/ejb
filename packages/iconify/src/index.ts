import type { Kire, KirePlugin } from "kire";

// Cache for fetched icons to avoid repeated requests during build/runtime
const iconCache = new Map<string, string>();

interface IconifyOptions {
	// Optional default class or other settings
	defaultClass?: string;
	apiUrl?: string; // Default: https://api.iconify.design
}

export const KireIconify: KirePlugin<IconifyOptions> = {
	name: "@kirejs/iconify",
	options: {},
	load(kire: Kire, opts) {
		const apiUrl = opts?.apiUrl || "https://api.iconify.design";
		const defaultClass = opts?.defaultClass || "";

		// Helper function to fetch icon
		// This will be injected into the context helper or used during compilation?
		// Since we need to await the fetch, we should probably do it in the handler.

		const fetchIcon = async (iconName: string): Promise<string> => {
			if (iconCache.has(iconName)) {
				return iconCache.get(iconName)!;
			}

			try {
				// Iconify format: prefix:name or prefix-name
				// The API expects /prefix/name.svg
				let prefix = "";
				let name = "";

				if (iconName.includes(":")) {
					[prefix, name] = iconName.split(":") as [string, string];
				} else if (iconName.includes("-")) {
					// Best guess for prefix-name format
					const parts = iconName.split("-");
					prefix = parts[0] as string;
					name = parts.slice(1).join("-");
				} else {
					// Fallback
					prefix = "mdi"; // default? or error
					name = iconName;
				}

				// Construct URL: https://api.iconify.design/prefix/name.svg?height=none&color=currentColor&box=1
				const url = `${apiUrl}/${prefix}/${name}.svg?height=none&color=currentColor&box=1`;

				const response = await fetch(url);
				if (!response.ok) {
					console.warn(`Failed to fetch icon: ${iconName}`);
					return `<!-- Icon not found: ${iconName} -->`;
				}

				const svg = await response.text();
				iconCache.set(iconName, svg);
				return svg;
			} catch (e) {
				console.error(`Error fetching icon ${iconName}:`, e);
				return `<!-- Error loading icon: ${iconName} -->`;
			}
		};

		// Add global helper to fetch icons (optional, for advanced usage)
		kire.$ctx("fetchIcon", fetchIcon);

		// 1. @icon('mdi:home', 'text-red-500')
		kire.directive({
			name: "icon",
			params: ["name:string", "className:string"],
			description: "Renders an Iconify icon SVG inline.",
			example: "@icon('mdi:home', 'text-blue-500')",
			onCall(ctx) {
				const nameExpr = ctx.param("name");
				const classExpr = ctx.param("className") || '""';

				ctx.raw(`await (async () => {`);
				ctx.raw(`  const svg = await $ctx.fetchIcon(${JSON.stringify(nameExpr)});`);
				ctx.raw(`  const cls = ${classExpr};`);
				ctx.raw(`  if (cls && svg.startsWith('<svg')) {`);
				ctx.raw(`     // Inject class into svg tag`);
				ctx.raw(
					`     const withClass = svg.replace('<svg', '<svg class="' + cls + '"');`,
				);
				ctx.raw(`     $ctx.res(withClass);`);
				ctx.raw(`  } else {`);
				ctx.raw(`     $ctx.res(svg);`);
				ctx.raw(`  }`);
				ctx.raw(`})();`);
			},
		});

		// 2. <iconify i="mdi:home" class="text-red-500" />
		kire.element({
			name: "iconify",
			description: "Renders an Iconify icon based on the 'icon' or 'i' attribute.",
			example: '<iconify icon="mdi:home" class="text-blue-500" />',
			void: true,
			async onCall(ctx) {
				const iconName =
					ctx.element.attributes.i || ctx.element.attributes.icon;
				if (!iconName) {
					ctx.update('<!-- <iconify> missing "i" or "icon" attribute -->');
					return;
				}

				const className =
					ctx.element.attributes.class ||
					ctx.element.attributes.className ||
					defaultClass;

				// Access global context helper directly for safety inside this closure
				const svg = await fetchIcon(iconName);

				if (className && svg.startsWith("<svg")) {
					let withClass = svg;
					if (svg.includes('class="')) {
						// Append to existing class
						withClass = svg.replace('class="', `class="${className} `);
					} else {
						// Add class attribute
						withClass = svg.replace("<svg", `<svg class="${className}"`);
					}
					ctx.replace(withClass);
				} else {
					ctx.replace(svg);
				}
			},
		});
	},
};

export default KireIconify;
