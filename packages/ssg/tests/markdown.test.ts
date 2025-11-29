import { describe, expect, it, spyOn, mock } from "bun:test";
import { KireSsg } from "../src/index";
import { Kire } from "kire";
import KireMarkdown from "../../markdown/src/index";
import { join } from "path";
import { rmdir, mkdir, writeFile, readFile, rm } from "fs/promises";

describe("KireSsg Markdown Generation", () => {
    const testDir = "./test-ssg-md";
    const outDir = join(testDir, "dist");
    const srcDir = join(testDir, "src");

    it("should generate html files from markdown using layout generator", async () => {
        // Setup directories
        await mkdir(srcDir, { recursive: true });
        await mkdir(join(srcDir, "docs"), { recursive: true });

        // Create layout file
        const layoutContent = `
        <html>
            <body>
                <div class="content">
                    @markdown('docs/*.md')
                </div>
            </body>
        </html>
        `;
        await writeFile(join(srcDir, "docs.kire"), layoutContent);

        // Create markdown files
        await writeFile(join(srcDir, "docs/p1.md"), "# Page 1\nContent 1");
        await writeFile(join(srcDir, "docs/p2.md"), "# Page 2\nContent 2");

        // Setup Kire
        const kire = new Kire({
            root: srcDir,
            plugins: [KireSsg, KireMarkdown],
            resolver: async (path) => await readFile(path, 'utf-8')
        });

        // Mock console.log to keep output clean
        const logSpy = spyOn(console, 'log').mockImplementation(() => {});
        const errorSpy = spyOn(console, 'error').mockImplementation(() => {});

        try {
            // Run Build
            await KireSsg.build({ out: outDir });

            // Check output
            const p1Html = await readFile(join(outDir, "docs/p1.html"), "utf-8");
            const p2Html = await readFile(join(outDir, "docs/p2.html"), "utf-8");

            expect(p1Html).toContain('<h1>Page 1</h1>');
            expect(p1Html).toContain('<p>Content 1</p>');
            expect(p1Html).toContain('<div class="content">');

            expect(p2Html).toContain('<h1>Page 2</h1>');
            expect(p2Html).toContain('<p>Content 2</p>');

        } finally {
            // Cleanup
            logSpy.mockRestore();
            errorSpy.mockRestore();
            await rm(testDir, { recursive: true, force: true });
        }
    });
});
