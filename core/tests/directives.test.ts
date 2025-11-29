import { describe, expect, it, spyOn } from "bun:test";
import { Kire } from "../src/kire";

describe("Kire Native Directives", () => {
  const kire = new Kire();

  // Helpers for mocking output
  const render = (template: string, locals = {}) => kire.render(template, locals);

  describe("Control Flow", () => {
    it("@if / @else / @endif", async () => {
        const tpl = `@if(show)Show@else Hide@end`;
        expect(await render(tpl, { show: true })).toBe("Show");
        expect(await render(tpl, { show: false })).toBe(" Hide");
    });

    it("@if / @elseif / @else", async () => {
        const tpl = `@if(val > 10)GT10@elseif(val > 5)GT5@else LE5@end`;
        expect(await render(tpl, { val: 11 })).toBe("GT10");
        expect(await render(tpl, { val: 6 })).toBe("GT5");
        expect(await render(tpl, { val: 2 })).toBe(" LE5");
    });

    it("@switch / @case / @default", async () => {
        const tpl = `@switch(val)@case('A')IsA@end@case('B')IsB@end@default IsDefault@end@end`;
        console.log(JSON.stringify(kire.parse(tpl), null, 3));
        expect(await render(tpl, { val: 'A' })).toBe("IsA");
        expect(await render(tpl, { val: 'B' })).toBe("IsB");
        expect(await render(tpl, { val: 'C' })).toBe(" IsDefault");
    });
  });

  describe("Loops", () => {
    it("@for", async () => {
        const tpl = `@for(item of items){{ item }},@end`;
        expect(await render(tpl, { items: [1, 2, 3] })).toBe("1,2,3,");
    });
  });

  describe("Variables", () => {
    it("@const", async () => {
        const tpl = `@const(x = 10){{ x }}`;
        expect(await render(tpl)).toBe("10");
    });

    it("@let", async () => {
        const tpl = `@let(x = 1){{ x }}@code x++ @end{{ x }}`;
        expect(await render(tpl)).toBe("12");
    });
  });

  describe("Code execution", () => {
      it("@code", async () => {
          let sideEffect = 0;
          const tpl = `@code sideEffect = 1; @end`;
          // Since code runs in 'with(ctx)', locals passed are copies or proxies?
          // Locals are assigned to context.
          // We can't easily check side effect on external var unless we pass an object.
          const obj = { val: 0 };
          await render(`@code obj.val = 1; @end`, { obj });
          expect(obj.val).toBe(1);
      });
  });
});

describe("Kire Layout Directives", () => {
    const kire = new Kire();

    it("@define / @defined", async () => {
        // @define creates content, @defined uses it.
        // They usually work within same render or layout inheritance.
        // Here we test in same template.
        const tpl = `@define('header')<h1>Head</h1>@end Body @defined('header')`;
        // @define block returns empty string (it captures content).
        // @defined replaces placeholder.
        const html = await kire.render(tpl);
        // " Body <h1>Head</h1>"
        expect(html).toContain("<h1>Head</h1>");
        expect(html).toContain("Body");
    });

    it("@stack / @push", async () => {
        const tpl = `@push('js')<script>1</script>@end @push('js')<script>2</script>@end @stack('js')`;
        const html = await kire.render(tpl);
        expect(html).toContain("<script>1</script>");
        expect(html).toContain("<script>2</script>");
        // Order usually preserved? push adds to array.
        // stack joins with newline.
        expect(html).toMatch(/<script>1<\/script>\s*<script>2<\/script>/);
    });
});

describe("Kire Component Directives", () => {
    const kire = new Kire();
    kire.resolverFn = async (path) => {
        if (path.includes('alert')) return `<div class="alert {{ type }}">{{ slots.default }} @if(slots.footer)<footer>{{ slots.footer }}</footer>@end</div>`;
        return '';
    };

    const render = (tpl: string, locals = {}) => kire.render(tpl, locals);

    it("@component with default slot", async () => {
        const tpl = `@component('alert', { type: 'info' })Message@end`;
        const html = await render(tpl);
        expect(html).toContain('class="alert info"');
        expect(html).toContain('Message');
    });

    it("@component with named slots", async () => {
        const tpl = `@component('alert', { type: 'warning' })Body @slot('footer')End@end@end`;
        const html = await render(tpl);
        expect(html).toContain('class="alert warning"');
        expect(html).toContain('Body');
        expect(html).toContain('<footer>End</footer>');
    });
});

describe("Kire Include Directive", () => {
    const kire = new Kire();
    kire.resolverFn = async (path) => {
        if (path.includes('child')) return `Child: {{ name }}`;
        if (path.includes('wrapper')) return `Wrapper: {{ content }}`;
        return '';
    };
    const render = (tpl: string, locals = {}) => kire.render(tpl, locals);

    it("@include with locals", async () => {
        const tpl = `@include('child', { name: 'Test' })`;
        expect(await render(tpl)).toBe("Child: Test");
    });

    it("@include with content block", async () => {
        const tpl = `@include('wrapper')Inner@end`;
        expect(await render(tpl)).toBe("Wrapper: Inner");
    });
});
