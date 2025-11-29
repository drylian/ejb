import { describe, expect, it } from "bun:test";
import { Kire } from "../src/kire";

describe("Kire Native Directives", () => {
	const kire = new Kire();

	const render = (template: string, locals = {}) =>
		kire.render(template, locals);

	describe("Control Flow", () => {
		it("@if / @else / @endif", async () => {
			const tpl = `@if(it.show)Show@else Hide@end`;
			expect(await render(tpl, { show: true })).toBe("Show");
			expect(await render(tpl, { show: false })).toBe(" Hide");
		});

		it("@if / @elseif / @else", async () => {
			const tpl = `@if(it.val > 10)GT10@elseif(it.val > 5)GT5@else LE5@end`;
			expect(await render(tpl, { val: 11 })).toBe("GT10");
			expect(await render(tpl, { val: 6 })).toBe("GT5");
			expect(await render(tpl, { val: 2 })).toBe(" LE5");
		});

		it("nested @if", async () => {
			const tpl = `@if(it.outer)Outer@if(it.inner)Inner@end@end`;
			expect(await render(tpl, { outer: true, inner: true })).toBe(
				"OuterInner",
			);
			expect(await render(tpl, { outer: true, inner: false })).toBe("Outer");
			expect(await render(tpl, { outer: false, inner: true })).toBe("");
		});

		it("@if with complex conditions", async () => {
			const tpl = `@if(it.a && it.b)Both@elseif(it.a || it.b)Either@else Neither@end`;
			expect(await render(tpl, { a: true, b: true })).toBe("Both");
			expect(await render(tpl, { a: true, b: false })).toBe("Either");
			expect(await render(tpl, { a: false, b: true })).toBe("Either");
			expect(await render(tpl, { a: false, b: false })).toBe(" Neither");
		});

		it("@if without else/elseif", async () => {
			const tpl = `@if(it.show)Content@end`;
			expect(await render(tpl, { show: true })).toBe("Content");
			expect(await render(tpl, { show: false })).toBe("");
		});

		it("@switch / @case / @default", async () => {
			const tpl = `@switch(it.val)@case('A')IsA@end@case('B')IsB@end@default IsDefault@end@end`;
			expect(await render(tpl, { val: "A" })).toBe("IsA");
			expect(await render(tpl, { val: "B" })).toBe("IsB");
			expect(await render(tpl, { val: "C" })).toBe(" IsDefault");
		});

		it("@switch with numeric cases", async () => {
			const tpl = `@switch(it.val)@case(1)Is1@end@case(2)Is2@end@default IsOther@end@end`;
			expect(await render(tpl, { val: 1 })).toBe("Is1");
			expect(await render(tpl, { val: 2 })).toBe("Is2");
			expect(await render(tpl, { val: 3 })).toBe(" IsOther");
		});
	});

	describe("Loops", () => {
		it("@for with array of", async () => {
			const tpl = `@for(item of it.items){{ item }},
@end`;
			expect(await render(tpl, { items: [1, 2, 3] })).toBe("1,2,3,");
		});

		it("@for with empty array", async () => {
			const tpl = `@for(item of it.items){{ item }},
@end`;
			expect(await render(tpl, { items: [] })).toBe("");
		});

		it("@for with object properties (for...in equivalent)", async () => {
			const tpl = `@for(key in it.obj){{ key }}:{{ it.obj[key] }},
@end`;
			expect(await render(tpl, { obj: { a: 1, b: 2 } })).toBe("a:1,b:2,");
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
			const obj = { val: 0 };
			await render(`@code it.obj.val = 1; @end`, { obj });
			expect(obj.val).toBe(1);
		});
	});
});

describe("Kire Layout Directives", () => {
	const kire = new Kire();
	const render = (template: string, locals = {}) =>
		kire.render(template, locals);

	it("@define / @defined", async () => {
		const tpl = `@define('header')<h1>Head</h1>@end Body @defined('header')`;
		const html = await render(tpl);
		expect(html).toContain("<h1>Head</h1>");
		expect(html).toContain("Body");
	});

	it("@defined before @define", async () => {
		const tpl = `Before @defined('footer') After @define('footer')<footer>Foot</footer>@end`;
		const html = await kire.render(tpl);
		expect(html).toBe("Before <footer>Foot</footer> After ");
	});

	it("multiple @defined for the same name", async () => {
		const tpl = `@defined('item')@defined('item')@define('item')Item@end`;
		const html = await kire.render(tpl);
		expect(html).toBe("ItemItem");
	});

	it("@define with empty content", async () => {
		const tpl = `Start @define('empty')@end End @defined('empty')`;
		const html = await kire.render(tpl);
		expect(html).toBe("Start  End ");
	});

	it("@stack / @push", async () => {
		const tpl = `@push('js')<script>1</script>@end @push('js')<script>2</script>@end @stack('js')`;
		const html = await render(tpl);
		expect(html).toContain("<script>1</script>");
		expect(html).toContain("<script>2</script>");
		expect(html).toMatch(/<script>1<\/script>\s*<script>2<\/script>/);
	});

	it("@stack with empty stack", async () => {
		const tpl = `Header @stack('css') Footer`;
		const html = await kire.render(tpl);
		expect(html).toBe("Header  Footer");
	});

	it("@push without @stack", async () => {
		const tpl = `Start @push('styles')<style>h1 { color: red; }</style>@end End`;
		const html = await kire.render(tpl);
		expect(html).toBe("Start  End");
	});

	it("order of @push items", async () => {
		const tpl = `@push('items')First@end@push('items')Second@end@push('items')Third@end@stack('items')`;
		const html = await kire.render(tpl);
		expect(html).toBe("First\nSecond\nThird");
	});

	it("@push with dynamic content", async () => {
		const tpl = `@push('scripts')<script>var x = {{ it.val }};</script>@end@stack('scripts')`;
		const html = await kire.render(tpl, { val: 123 });
		expect(html).toBe("<script>var x = 123;</script>");
	});
});

describe("Kire Component Directives", () => {
	const kire = new Kire();
	kire.resolverFn = async (path) => {
		if (path.includes("alert"))
			return `<div class="alert {{ it.type }}">{{ it.slots.default }} @if(it.slots.footer)<footer>{{ it.slots.footer }}</footer>@end</div>`;
		if (path.includes("card"))
			return `<div class="card"><h3>{{ it.title }}</h3>{{ it.slots.default }}</div>`;
		return null;
	};

	const render = (tpl: string, locals = {}) => kire.render(tpl, locals);

	it("@component with default slot", async () => {
		const tpl = `@component('alert', { type: 'info' })Message@end`;
		const html = await render(tpl);
		expect(html).toContain('class="alert info"');
		expect(html).toContain("Message");
	});

	it("@component with named slots", async () => {
		const tpl = `@component('alert', { type: 'warning' })Body @slot('footer')End@end@end`;
		const html = await render(tpl);
		expect(html).toContain('class="alert warning"');
		expect(html).toContain("Body");
		expect(html).toContain("<footer>End</footer>");
	});

	it("@component with complex variables", async () => {
		const tpl = `@component('alert', { type: it.user.status })Hello {{ it.user.name }}@end`;
		const html = await render(tpl, {
			user: { name: "World", status: "success" },
		});
		expect(html).toContain('class="alert success"');
		expect(html).toContain("Hello World");
	});

	it("@component with multiple named slots", async () => {
		const tpl = `@component('alert', { type: 'success' })
        @slot('default')Default Content@end
        @slot('footer')Footer Content@end
    @end`;
		const html = await render(tpl);
		expect(html).toContain('class="alert success"');
		expect(html).toContain("Default Content");
		expect(html).toContain("<footer>Footer Content</footer>");
	});

	it("@component without provided slots (should render default slot if used)", async () => {
		const tpl = `@component('card', { title: 'My Card' })No custom slots@end`;
		const html = await render(tpl);
		expect(html).toContain(
			'<div class="card"><h3>My Card</h3>No custom slots</div>',
		);
	});

	it("@component without provided named slots (should not render if not present)", async () => {
		const tpl = `@component('alert', { type: 'info' })Message Only@end`;
		const html = await render(tpl);
		expect(html).toContain('class="alert info"');
		expect(html).toContain("Message Only");
		expect(html).not.toContain("<footer>");
	});
});

describe("Kire Include Directive", () => {
	const kire = new Kire();
	kire.resolverFn = async (path) => {
		if (path.includes("child")) return `Child: {{ it.name }}`;
		if (path.includes("wrapper")) return `Wrapper: {{ it.content }}`;
		if (path.includes("grandchild"))
			return `Grandchild: {{ it.item.name }} and {{ it.item.value }}`;
		if (path.includes("nested"))
			return `@include('grandchild', { item: it.n_item })`;
		return null;
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

	it("@include with non-existent path", async () => {
		const tpl = `Start @include('nonexistent') End`;
		expect(await render(tpl)).toBe("Start End");
	});

	it("@include with nested includes", async () => {
		const tpl = `@include('nested', { n_item: { name: 'A', value: 1 } })`;
		expect(await render(tpl)).toBe("Grandchild: A and 1");
	});

	it("@include passing complex locals", async () => {
		const tpl = `@include('child', { name: it.user.firstName + ' ' + it.user.lastName })`;
		const html = await render(tpl, {
			user: { firstName: "John", lastName: "Doe" },
		});
		expect(html).toBe("Child: John Doe");
	});
});
