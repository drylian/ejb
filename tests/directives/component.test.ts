import { test, expect } from "bun:test";
import { join } from "node:path";
import { Ejb } from "../../src/ejb";
import { EJBNodeJSResolver } from "../../src/resolvers";

const pwd = process.cwd();

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