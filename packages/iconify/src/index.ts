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
		const fetchIcon = async (iconName: string, queryParams: Record<string, string> = {}): Promise<string> => {
			// Create a cache key that includes the query parameters to differentiate variants
			// Sort keys to ensure stability
			const queryKeys = Object.keys(queryParams).sort();
			const queryString = queryKeys.map(k => `${k}=${encodeURIComponent(queryParams[k])}`).join('&');
			const cacheKey = `${iconName}?${queryString}`;

			if (iconCache.has(cacheKey)) {
				return iconCache.get(cacheKey)!;
			}

			try {
				let prefix = "";
				let name = "";

				if (iconName.includes(":")) {
					[prefix, name] = iconName.split(":") as [string, string];
				} else if (iconName.includes("-")) {
					const parts = iconName.split("-");
					prefix = parts[0] as string;
					name = parts.slice(1).join("-");
				} else {
					prefix = "mdi";
					name = iconName;
				}

				// Construct URL with query params
				// Default to raw icon if no params to allow local manipulation flexibility, 
				// but user requested URL-based sizing.
				let url = `${apiUrl}/${prefix}/${name}.svg`;
				if (queryString) {
					url += `?${queryString}`;
				}

				const response = await fetch(url);
				if (!response.ok) {
					console.warn(`Failed to fetch icon: ${iconName}`);
					return `<!-- Icon not found: ${iconName} -->`;
				}

				const svg = await response.text();
				iconCache.set(cacheKey, svg);
				return svg;
			} catch (e) {
				console.error(`Error fetching icon ${iconName}:`, e);
				return `<!-- Error loading icon: ${iconName} -->`;
			}
		};

		kire.$ctx("fetchIcon", fetchIcon);

		// 1. @icon('mdi:home', 'text-red-500', { width: '24' })
		kire.directive({
			name: "icon",
			params: ["name:string", "className:string", "attrs:object"],
			description: "Renders an Iconify icon SVG.",
			example: "@icon('mdi:home', 'text-blue-500', { width: '24' })",
			onCall(ctx) {
				const nameExpr = ctx.param("name");
				const classExpr = ctx.param("className") || '""';
				const attrsExpr = ctx.param("attrs") || "{}";

				ctx.raw(`await (async () => {`);
				// Split attributes into API params and HTML attributes
				ctx.raw(`  const rawAttrs = ${attrsExpr};`);
				ctx.raw(`  const apiParams = {};`);
				ctx.raw(`  const htmlAttrs = {};`);
				ctx.raw(`  const apiKeys = ['width', 'height', 'color', 'flip', 'rotate', 'box'];`);
				
				ctx.raw(`  for (const [k, v] of Object.entries(rawAttrs)) {`);
				ctx.raw(`    if (apiKeys.includes(k)) apiParams[k] = v;`);
				ctx.raw(`    else htmlAttrs[k] = v;`);
				ctx.raw(`  }`);

				ctx.raw(`  const svg = await $ctx.fetchIcon(${JSON.stringify(nameExpr)}, apiParams);`);
				ctx.raw(`  const cls = ${classExpr};`);
				
				ctx.raw(`  if (svg.startsWith('<svg')) {`);
				ctx.raw(`     let finalSvg = svg;`);
				
				// Handle Class
				ctx.raw(`     if (cls) {`);
				ctx.raw(`        if (finalSvg.includes('class="')) {`);
				ctx.raw(`           finalSvg = finalSvg.replace('class="', 'class="' + cls + ' ');`);
				ctx.raw(`        } else {`);
				ctx.raw(`           finalSvg = finalSvg.replace('<svg', '<svg class="' + cls + '"');`);
				ctx.raw(`        }`);
				ctx.raw(`     }`);

				// Handle remaining HTML attributes
				ctx.raw(`     for (const [key, value] of Object.entries(htmlAttrs)) {`);
				ctx.raw(`        const regex = new RegExp(key + '="[^"]*"', 'g');`);
				ctx.raw(`        if (regex.test(finalSvg)) {`);
				ctx.raw(`           finalSvg = finalSvg.replace(regex, key + '="' + value + '"');`);
				ctx.raw(`        } else {`);
				ctx.raw(`           finalSvg = finalSvg.replace('<svg', '<svg ' + key + '="' + value + '"');`);
				ctx.raw(`        }`);
				ctx.raw(`     }`);

				ctx.raw(`     $ctx.res(finalSvg);`);
				ctx.raw(`  } else {`);
				ctx.raw(`     $ctx.res(svg);`);
				ctx.raw(`  }`);
				ctx.raw(`})();`);
			},
		});

		// 2. <iconify i="mdi:home" size="24" />
		kire.element({
			name: "iconify",
			description: "Renders an Iconify icon.",
			void: true,
			async onCall(ctx) {
				const attrs = { ...ctx.element.attributes };
				const iconName = attrs.i || attrs.icon;
				
				if (!iconName) {
					ctx.update('<!-- <iconify> missing "i" or "icon" attribute -->');
					return;
				}

				delete attrs.i;
				delete attrs.icon;
				
				const className = attrs.class || attrs.className || defaultClass;
				delete attrs.class;
				delete attrs.className;

				// Handle 'size'
				if (attrs.size) {
					if (!attrs.width) attrs.width = attrs.size;
					if (!attrs.height) attrs.height = attrs.size;
					delete attrs.size;
				}

				// Separate API params from HTML attributes
				const apiKeys = ['width', 'height', 'color', 'flip', 'rotate', 'box'];
				const apiParams: Record<string, string> = {};
				const htmlAttrs: Record<string, string> = {};

				for (const [k, v] of Object.entries(attrs)) {
					if (apiKeys.includes(k)) {
						apiParams[k] = v;
					} else {
						htmlAttrs[k] = v;
					}
				}

				// Fetch with params
				const svg = await fetchIcon(iconName, apiParams);

				if (!svg.startsWith("<svg")) {
					ctx.replace(svg);
					return;
				}

				let finalSvg = svg;

				// Apply Class
				if (className) {
					if (finalSvg.includes('class="')) {
						finalSvg = finalSvg.replace('class="', `class="${className} `);
					} else {
						finalSvg = finalSvg.replace("<svg", `<svg class="${className}"`);
					}
				}

				// Apply remaining HTML attributes (e.g. style, data-*, aria-*)
				for (const [key, value] of Object.entries(htmlAttrs)) {
					const regex = new RegExp(`${key}="[^"]*"`);
					if (regex.test(finalSvg)) {
						finalSvg = finalSvg.replace(regex, `${key}="${value}"`);
					} else {
						finalSvg = finalSvg.replace("<svg", `<svg ${key}="${value}"`);
					}
				}

				ctx.replace(finalSvg);
			},
		});
	},
};

export default KireIconify;
