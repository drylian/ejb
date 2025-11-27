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
    const clean = result.replace(/\s+/g, ' ').trim();
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
    const clean = result.replace(/\s+/g, ' ').trim();
    expect(clean).toContain("True");
    expect(clean).toContain("1 2");
});

test("Kire - Include", async () => {
    const kire = new Kire({
        root: '/',
        resolver: async (path) => {
            if (path === '/header.kire') return "<h1>HEADER</h1>";
            throw new Error("Not found");
        }
    });
    
    const result = await kire.render("@include('header')");
    expect(result).toBe("<h1>HEADER</h1>");
});
