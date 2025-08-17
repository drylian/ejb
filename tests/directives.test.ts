import { expect, test } from "bun:test";
import { Ejb } from "../src/ejb";
import { EJBNodeJSResolver } from "../src/resolvers";
import { join } from "node:path";

const pwd = process.cwd();

// Shared configuration for component testing
const createEjbInstance = () =>
	new Ejb({
		async: false,
		aliases: { "@": join(pwd, "tests", "views") },
		resolver: EJBNodeJSResolver(),
	});

test("should handle component with default slot", () => {
	const ejb = createEjbInstance();
	const template = `
        @component('@/box')
            <p>Default slot content</p>
        @end
    `;

	const result = ejb.render(template);

	// Check if the default slot content has been rendered inside the div.box
	expect(result.replace(/\s+/g, " ").trim()).toContain(
		"<p>Default slot content</p>",
	);
});

test("should handle component with named slots", () => {
	const ejb = createEjbInstance();
	const template = `
        @component('@/box')
                <p>Default slot content</p>    
            @slot('header')
                <h1>Only Header</h1>
            @slot('content')
                <p>Custom Content</p>
        @end
    `;

	const result = ejb.render(template);

	// Check the complete structure with named slots and default.
	const normalizedResult = result.replace(/\s+/g, " ").trim();

	expect(normalizedResult).toContain('<div class="box">');
	expect(normalizedResult).toContain("<h1>Only Header</h1>");
	expect(normalizedResult).toContain("<p>Custom Content</p>");
	expect(normalizedResult).toContain("<p>Default slot content</p>");
});

test("should handle component with partial slots", () => {
	const ejb = createEjbInstance();
	const template = `
        @component('@/box')
                <p>Default slot only</p>
            @slot('header')
                <h1>Only Header</h1>
        @end
    `;

	const result = ejb.render(template);
	const normalizedResult = result.replace(/\s+/g, " ").trim();

	expect(normalizedResult).toContain("<h1>Only Header</h1>");
	expect(normalizedResult).toContain("<p>Default slot only</p>");
	expect(normalizedResult).not.toContain("$header");
	expect(normalizedResult).not.toContain("$content");
});

test("should handle empty slots", () => {
	const ejb = createEjbInstance();
	const template = `
        @component('@/box')
            <!-- No slots provided -->
        @end
    `;

	const result = ejb.render(template);

	// It should render only the basic structure without content.
	expect(result.replace(/\s+/g, " ").trim()).toBe(
		'<div class="box"> <!-- No slots provided --> </div>',
	);
});

test("should handle 'if' directive", () => {
	const ejb = createEjbInstance();
	const template = `@if(true)Hello@end`;
	const result = ejb.render(template);
	expect(result).toBe("Hello");
});

test("should handle 'for' directive", () => {
	const ejb = createEjbInstance();
	const template = `@for(let i = 0; i < 3; i++){{i}}@end`;
	const result = ejb.render(template);
	expect(result).toBe("012");
});

test("should handle 'import' directive", () => {
	const ejb = createEjbInstance();
	const template = `@import('@/imported')`;
	const result = ejb.render(template);
	expect(result).toContain("This is imported content.");
});

test("should handle 'isset' directive", () => {
	const ejb = createEjbInstance();
	const template = `@isset(it.name)`;
	const result = ejb.render(template, { name: "John" });
	expect(result).toBe("John");
});

test("should handle 'css' directive", () => {
	const ejb = createEjbInstance();
	const template = `@head()@css()body { color: red; }@end`;
	expect(ejb.render(template)).toContain(
		"<style>body { color: red; }\n</style>",
	);
});

test("should handle 'head' directive", () => {
	const ejb = createEjbInstance();
	const template = `@head()`;
	const result = ejb.compileNode(ejb.parserAst(template));
	expect(result).toContain("<!--$EJB-HEAD-REPLACER-->");
});
