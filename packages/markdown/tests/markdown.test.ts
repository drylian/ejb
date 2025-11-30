import { describe, expect, it, afterAll, beforeAll } from "bun:test";
import { KireMarkdown } from "../src/index";
import { Kire } from "kire";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";

const TEMP_MD = "temp_test.md";
const TEMP_MD_CONTENT = "# Hello File\n\nThis is a file test.";

describe("KireMarkdown", () => {
	beforeAll(async () => {
		await writeFile(TEMP_MD, TEMP_MD_CONTENT);
	});

	afterAll(async () => {
		try {
			await unlink(TEMP_MD);
		} catch {} // Ignore errors during cleanup
	});

	it("should render markdown string", async () => {
		const kire = new Kire({ plugins: [KireMarkdown] });
		const tpl = `@markdown('# Hello World')`;
		const result = await kire.render(tpl);
		expect(result).toContain("<h1>Hello World</h1>");
	});

	it("should render markdown from file", async () => {
		const kire = new Kire({
			plugins: [KireMarkdown],
			root: process.cwd(), // Ensure root is current dir for resolution
		});
		// Must parse the argument as string literal manually if parser strips quotes
		// The directive implementation uses JSON.stringify(source), so passing string literal works if parser passes it correctly.
		// If parser strips quotes, we pass filename without quotes?
		// @markdown('temp_test.md') -> param is "temp_test.md"
		// JSON.stringify("temp_test.md") -> "temp_test.md" (quoted string)
		// Code: const src = "temp_test.md";
		// src ends with .md -> true.
		// Works.

		const tpl = `@markdown('${TEMP_MD}')`;
		const result = await kire.render(tpl);
		expect(result).toContain("<h1>Hello File</h1>");
		expect(result).toContain("<p>This is a file test.</p>");
	});

	it("should render SSG marker for glob pattern", async () => {
		const kire = new Kire({ plugins: [KireMarkdown] });
		const tpl = `@markdown('content/*.md')`;
		const result = await kire.render(tpl);
		// Directive logic: if (source.includes("*")) output marker.
		// param is "content/*.md".
		// includes * -> true.
		// Output: <!-- KIRE_MARKDOWN_GEN:content/*.md -->
		expect(result).toContain("<!-- KIRE_MARKDOWN_GEN:content/*.md -->");
	});

	it("should expose kire.parseMarkdown helper", async () => {
		const kire = new Kire({ plugins: [KireMarkdown] });
		expect(kire.parseMarkdown).toBeDefined();
		const html = await kire.parseMarkdown("**Bold**");
		expect(html).toContain("<strong>Bold</strong>");
	});

	it("should handle missing file gracefully (fallback to string)", async () => {
		const kire = new Kire({ plugins: [KireMarkdown] });
		const tpl = `@markdown('missing_file.md')`;
		const result = await kire.render(tpl);
		// Logic: catch(e) { content = src; }
		// content = "missing_file.md"
		// render "missing_file.md" as markdown -> "<p>missing_file.md</p>"
		expect(result).toContain("<p>missing_file.md</p>");
	});
});
