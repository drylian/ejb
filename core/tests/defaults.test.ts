import { expect, test } from "bun:test";
import { Kire } from "../src/index";

test("Kire - Default Directives: define/defined", async () => {
	const kire = new Kire();

	// Simple define and defined in same template
	const tpl = `
        @define('header')
            <h1>Header Content</h1>
        @end
        <div>
            @defined('header')
        </div>
    `;

	const result = await kire.render(tpl);
	// Clean up newlines/spaces for easier assertion
	const clean = result.replace(/\s+/g, " ").trim();
	expect(clean).toContain("<div> <h1>Header Content</h1> </div>");
});

test("Kire - Default Directives: native if/for", async () => {
	const kire = new Kire();
	const tpl = `
    @if(true)
      True
    @else
      False
    @end
    @for(i of [1,2])
      {{i}}
    @end
    `;
	const result = await kire.render(tpl);
	const clean = result.replace(/\s+/g, " ").trim();
	expect(clean).toContain("True");
	expect(clean).toContain("1 2");
});

test("Kire - Include", async () => {
	const kire = new Kire({
		root: "/",
		resolver: async (path) => {
			if (path === "/header.kire") return "<h1>HEADER</h1>";
			return null;
		},
	});

	const tpl = `@include('/header.kire')`;
	expect(await kire.render(tpl)).toBe("<h1>HEADER</h1>");

	const tpl2 = `@include('/some/path.kire')`;
	// Expect this to fail or return empty, not throw uncaught.
	await expect(await kire.render(tpl2)).resolves.toBe("");
});
