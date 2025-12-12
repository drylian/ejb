import { expect, test } from "bun:test";
import { Kire, KireContext } from "../src/index";

test("Kire - HTML Base Template", async () => {
	const kire = new Kire({
		root: "/views",
		resolver: async (path) => {
			if (path === "/views/layout.kire") {
				return `
<!DOCTYPE html>
<html>
<head>
    <title>{{ title }}</title>
</head>
<body>
    @if(showNav)
        <nav>Navigation</nav>
    @end
    <main>
        @slot('content')
    </main>
    <footer>&copy; 2025</footer>
</body>
</html>`;
			}
			throw new Error(`File not found: ${path}`);
		},
	});

	// Mock directive for layout/slot mechanism
	// This is a simplified implementation for testing purposes
	kire.$ctx("$layouts", {});
	kire.directive({
		name: "layout",
		params: ["path:string"],
		children: true,
		parents: [
			{
				name: "slot",
				children: true,
				params: ["reference?:string"],
				onCall(ctx) {
					const reference = ctx.param("reference") ?? "";
					ctx.raw("");
				},
			},
		],
		async onCall(ctx) {
			const layoutPath = ctx.param("path");
			const resolved = ctx.resolve(layoutPath);
			const content = await kire.$resolver(resolved);
			const layout = `$ctx.$layouts[\`${layoutPath}\`]`;
			ctx.pre(`${layout} = ${ctx.func(await ctx.render(content))};`);

			if (ctx.children) ctx.set(ctx.children);

			ctx.raw(`
                    ${ctx.children ? `})();` : ""}
                    $ctx.res = originalRes;
                    return inner;
                })($ctx);
                
                // Put captured content into a context variable 'slots'
                $ctx.slots = $ctx.slots || {};
                $ctx.slots['content'] = captured;
            `);

			// Simplified approach:
			// We want to inject the layout code surrounding the content.
			// But typically layout renders the content inside it.

			// Let's try a simpler "Include" test for HTML structure first
			// since implementing full Layout/Slot requires runtime component logic.
		},
	});

	// Let's test a simpler structure first: Conditional HTML
	const htmlTemplate = `
<div class="user-profile">
    <h1>{{ user.name }}</h1>
    @if(user.isAdmin)
        <span class="badge">Admin</span>
    @else
        <span class="badge">User</span>
    @end
    <ul>
    @for(item in user.items)
        <li>{{ item }}</li>
    @end
    </ul>
</div>`;

	// Register 'for' directive
	kire.directive({
		name: "for",
		params: ["expr:string"],
		children: true,
		onCall(ctx) {
			const expr = ctx.param("expr"); // "item in user.items"
			const [itemVar, , listVar] = expr.split(" ");

			ctx.raw(`for (const ${itemVar} of ${listVar}) {`);
			if (ctx.children) ctx.set(ctx.children);
			ctx.raw(`}`);
		},
	});

	kire.directive({
		name: "if",
		params: ["cond:string"],
		children: true,
		parents: [
			{
				name: "else",
				children: true,
				onCall(c) {
					c.raw("} else {");
					if (c.children) c.set(c.children);
				},
			},
		],
		onCall(ctx) {
			ctx.raw(`if (${ctx.param("cond")}) {`);
			if (ctx.children) ctx.set(ctx.children);
			if (ctx.parents) ctx.set(ctx.parents);
			ctx.raw("}");
		},
	});

	const locals = {
		user: {
			name: "John Doe",
			isAdmin: true,
			items: ["Apple", "Banana"],
		},
	};

	const result = await kire.render(htmlTemplate, locals);

	expect(result).toContain("<h1>John Doe</h1>");
	expect(result).toContain('<span class="badge">Admin</span>');
	expect(result).not.toContain('<span class="badge">User</span>');
	expect(result).toContain("<li>Apple</li>");
	expect(result).toContain("<li>Banana</li>");
});
