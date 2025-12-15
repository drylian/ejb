import { expect, test } from "bun:test";
import { Kire } from "../src/index";

test("Kire - Elements: Style Processing", async () => {
	const kire = new Kire();

	// Register an element handler for 'style'
	kire.element("style", (ctx) => {
		const newContent = `<!-- Processed Style: ${ctx.element.inner.trim()} -->`;
		ctx.replace(newContent);
	});

	const input = `
<html>
<head></head>
<body>
    <style> body { color: red; } </style>
    <h1>Hello</h1>
</body>
</html>`;

	const result = await kire.render(input);

	expect(result).toContain("<!-- Processed Style: body { color: red; } -->");
	expect(result).not.toContain("<style>");
});

test("Kire - Elements: Modifying Head", async () => {
	const kire = new Kire();

	kire.element("meta", (ctx) => {
		// Move meta tags to the start of head
		// This is tricky with regex replacement if we don't have robust parsing.
		// Let's just add an attribute to them.

		const newTag = ctx.element.outer.replace(
			"<meta",
			'<meta data-processed="true"',
		);
		ctx.update(ctx.content.replace(ctx.element.outer, newTag));
	});

	const input = `<head><meta name="test"></head>`;
	const result = await kire.render(input);

	expect(result).toContain('<meta data-processed="true" name="test">');
});
