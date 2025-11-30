import { describe, expect, it, mock, beforeEach } from "bun:test";
import { KireIconify } from "../src/index";
import { Kire } from "kire";

describe("KireIconify", () => {
	// Reset mocks before each test
	beforeEach(() => {
		mock.restore();
	});

	it("should fetch and render icon with class injection (Element)", async () => {
		const kire = new Kire({ plugins: [KireIconify] });

		global.fetch = mock(async (url: string) => {
			if (url.includes("mdi/home.svg")) {
				return new Response('<svg viewBox="0 0 24 24"><path d="..."/></svg>', {
					status: 200,
				});
			}
			return new Response(null, { status: 404 });
		});

		const template = `<iconify i="mdi:home" class="text-red-500" />`;
		const result = await kire.render(template);

		expect(result).toContain('<svg class="text-red-500" viewBox="0 0 24 24">');
		expect(global.fetch).toHaveBeenCalledTimes(1);
	});

	it("should support 'icon' attribute alias (Element)", async () => {
		const kire = new Kire({ plugins: [KireIconify] });

		global.fetch = mock(async (url: string) => {
			if (url.includes("mdi/account.svg")) {
				return new Response('<svg><path d="..."/></svg>', { status: 200 });
			}
			return new Response(null, { status: 404 });
		});

		const result = await kire.render(`<iconify icon="mdi:account" />`);
		expect(result).toContain("<svg>");
		expect(global.fetch).toHaveBeenCalledTimes(1);
	});

	it("should handle fetch errors gracefully", async () => {
		const kire = new Kire({ plugins: [KireIconify] });

		global.fetch = mock(async () => new Response(null, { status: 404 }));

		const result = await kire.render(`<iconify i="bad:icon" />`);
		expect(result).toContain("<!-- Icon not found: bad:icon -->");
	});

	it("should cache fetched icons to avoid redundant requests", async () => {
		const kire = new Kire({ plugins: [KireIconify] });

		global.fetch = mock(async (url: string) => {
			return new Response("<svg>cached</svg>", { status: 200 });
		});

		// Render same icon twice
		await kire.render(`<iconify i="mdi:cached" />`);
		await kire.render(`<iconify i="mdi:cached" />`);

		// Should be called only once
		expect(global.fetch).toHaveBeenCalledTimes(1);
	});

	it("should use the @icon directive correctly", async () => {
		const kire = new Kire({ plugins: [KireIconify] });

		global.fetch = mock(async () => {
			return new Response('<svg viewBox="0 0 10 10"></svg>', { status: 200 });
		});

		const tpl = `@icon("mdi:check", "'text-green-500'")`;
		const result = await kire.render(tpl);

		expect(result).toContain('<svg class="text-green-500" viewBox="0 0 10 10">');
	});

	it("should parse hyphenated icon names (prefix-name)", async () => {
		const kire = new Kire({ plugins: [KireIconify] });

		global.fetch = mock(async (url: string | URL | Request) => {
			// Check if url string contains the expected path
			// Bun's mock fetch receives string or request.
			const urlStr = url.toString();
			if (urlStr.includes("/fa/solid-home.svg")) {
				return new Response("<svg>fa-home</svg>", { status: 200 });
			}
			return new Response(null, { status: 404 });
		});

		const result = await kire.render(`<iconify i="fa-solid-home" />`);
		expect(result).toContain("<svg>fa-home</svg>");
	});

	it("should merge classes if svg already has class attribute", async () => {
		const kire = new Kire({ plugins: [KireIconify] });

		global.fetch = mock(async () => {
			return new Response('<svg class="base-icon" viewBox="0 0 24 24"></svg>', {
				status: 200,
			});
		});

		const result = await kire.render(
			`<iconify i="mdi:merge" class="extra-class" />`,
		);
		expect(result).toContain('class="extra-class base-icon"');
	});

	it("should use default class from options if provided", async () => {
		const kire = new Kire({
			plugins: [[KireIconify, { defaultClass: "icon-default" }]],
		});

		global.fetch = mock(async () => {
			return new Response("<svg></svg>", { status: 200 });
		});

		const result = await kire.render(`<iconify i="mdi:default" />`);
		expect(result).toContain('class="icon-default"');
	});
});