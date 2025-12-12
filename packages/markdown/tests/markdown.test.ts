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
			root: process.cwd(),
		});
		// Mock $readdir just in case, though not used here
		kire.$readdir = async () => []; 

		const tpl = `@markdown('${TEMP_MD}')`;
		const result = await kire.render(tpl);
		expect(result).toContain("<h1>Hello File</h1>");
		expect(result).toContain("<p>This is a file test.</p>");
	});

	it("should render wildcard content (glob pattern)", async () => {
		const kire = new Kire({ plugins: [KireMarkdown] });
		
		// Mock $readdir
		kire.$readdir = async (pattern) => {
			if (pattern === "content/*.md") return ["file1.md", "file2.md"];
			return [];
		};
		
		// Mock renderMarkdown to avoid file reading
		kire.$ctx("renderMarkdown", async (src: string) => {
			if (src === "file1.md") return "<h1>File 1</h1>";
			if (src === "file2.md") return "<h1>File 2</h1>";
			return "";
		});

		const tpl = `@markdown('content/*.md')`;
		const result = await kire.render(tpl);
		
		expect(result).toContain("<h1>File 1</h1>");
		expect(result).toContain("<h1>File 2</h1>");
	});

	it("should expose kire.parseMarkdown helper", async () => {
		const kire = new Kire({ plugins: [KireMarkdown] });
		expect(kire.parseMarkdown).toBeDefined();
		if (kire.parseMarkdown) {
			const html = await kire.parseMarkdown("**Bold**");
			expect(html).toContain("<strong>Bold</strong>");
		}
	});

	it("should handle missing file gracefully (fallback to string)", async () => {
		const kire = new Kire({ plugins: [KireMarkdown] });
		const tpl = `@markdown('missing_file.md')`;
		const result = await kire.render(tpl);
		expect(result).toContain("<p>missing_file.md</p>");
	});
});
